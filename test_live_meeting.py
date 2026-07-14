"""
test_live_meeting.py

Simulates a browser's live mic stream by converting any audio file (wav,
mp3, m4a, etc.) into raw 16-bit PCM / 16kHz / mono — exactly what
pcm-processor.js sends from the browser — and streaming it over the
/meetings/{id}/live WebSocket in small, paced chunks. Prints every
transcript event the backend relays back, live, as it arrives.

Why Python instead of native PowerShell/Bash for this part: correctly
implementing the WebSocket protocol (framing, masking, concurrent
send/receive) by hand in a shell script is genuinely error-prone. This
reuses the same `websockets` library your backend already depends on,
so it behaves identically on Windows and Linux.

Usage:
    python test_live_meeting.py --ws-url "ws://localhost/meetings/<id>/live?token=<jwt>" --audio-file "sample_call.mp3"

Requires: ffmpeg on PATH, and `pip install websockets` on the machine
running this script (separate from your Docker containers — this runs
on your host machine, hitting the service through Nginx like a real browser would).
"""

import argparse
import asyncio
import json
import os
import subprocess
import sys
import tempfile

import websockets

SAMPLE_RATE      = 16000
BYTES_PER_SAMPLE = 2   # 16-bit PCM
CHANNELS         = 1
CHUNK_MS         = 100 # send in 100ms frames, mimicking real-time mic pacing
CHUNK_BYTES      = int(SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * (CHUNK_MS / 1000))


def convert_to_pcm16(input_path: str) -> str:
    """
    Uses ffmpeg to convert any input audio/video file into raw, headerless
    16-bit PCM, mono, 16kHz — matching pcm-processor.js's output exactly,
    and what Deepgram's streaming API expects on the other end.
    """
    fd, out_path = tempfile.mkstemp(suffix=".pcm")
    os.close(fd)
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-f", "s16le", "-acodec", "pcm_s16le",
        "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS),
        out_path,
    ]
    print(f"[convert] {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        raise RuntimeError("ffmpeg conversion failed — is ffmpeg installed and on PATH?")
    return out_path


async def receive_loop(ws):
    """Prints every message the backend relays back, live, as it arrives."""
    try:
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") == "transcript":
                tag = "FINAL  " if msg["is_final"] else "interim"
                print(f"  [{tag}] Speaker {msg['speaker']}: {msg['text']}")
            else:
                print(f"  [server] {msg}")
    except websockets.exceptions.ConnectionClosed as e:
        print(f"[ws] Server closed the connection (code={e.code}, reason={e.reason!r})")


async def send_audio(ws, pcm_path: str):
    """
    Streams the converted PCM file in small, paced chunks — mirroring how
    the browser's AudioWorklet sends continuous small frames rather than
    dumping the whole file at once. Pacing matters here: it exercises the
    backend's heartbeat/timing logic more realistically than an instant dump would.
    """
    total_bytes = os.path.getsize(pcm_path)
    duration_sec = total_bytes / (SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS)
    print(f"[send_audio] Streaming {total_bytes} bytes (~{duration_sec:.1f}s of audio) in {CHUNK_MS}ms frames")

    with open(pcm_path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_BYTES)
            if not chunk:
                break
            await ws.send(chunk)
            await asyncio.sleep(CHUNK_MS / 1000)

    print("[send_audio] Finished streaming — sending explicit end signal")
    await ws.send(json.dumps({"type": "end"}))


async def run_test(ws_url: str, pcm_path: str):
    print(f"[ws] Connecting to {ws_url}")
    async with websockets.connect(ws_url) as ws:
        print("[ws] Connected — live transcription test starting\n")
        recv_task = asyncio.create_task(receive_loop(ws))
        await send_audio(ws, pcm_path)

        # Give the server a few seconds to relay any trailing transcript
        # events (Deepgram's CloseStream grace period) before we give up
        # waiting and close our end.
        try:
            await asyncio.wait_for(recv_task, timeout=8)
        except asyncio.TimeoutError:
            recv_task.cancel()

    print("\n[ws] Connection closed")


def main():
    parser = argparse.ArgumentParser(description="Stream an audio file over the live transcription WebSocket, simulating a browser mic.")
    parser.add_argument("--ws-url", required=True, help="Full WebSocket URL including token query param")
    parser.add_argument("--audio-file", required=True, help="Path to any audio/video file containing speech")
    args = parser.parse_args()

    pcm_path = convert_to_pcm16(args.audio_file)
    try:
        asyncio.run(run_test(args.ws_url, pcm_path))
    finally:
        os.remove(pcm_path)


if __name__ == "__main__":
    main()