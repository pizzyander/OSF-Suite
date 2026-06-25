#!/usr/bin/env python3
"""
Helper invoked by test_whisper_chunking.sh — validates the JSON response
from POST /transcribe-chunked against the expected chunk math.
Exits non-zero with a clear message on any failed assertion.
"""
import json
import sys

def fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)

def main():
    response_path = sys.argv[1]
    expected_duration = float(sys.argv[2])
    chunk_seconds = int(sys.argv[3])

    with open(response_path) as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            fail(f"Response is not valid JSON: {e}")

    # --- Top-level shape ---------------------------------------------------
    required_top_keys = ["text", "audio_duration", "chunk_seconds", "chunk_count", "chunks", "model"]
    for key in required_top_keys:
        if key not in data:
            fail(f"Missing top-level key '{key}' in response")

    if not isinstance(data["chunks"], list) or len(data["chunks"]) == 0:
        fail("'chunks' is missing or empty")

    if data["chunk_seconds"] != chunk_seconds:
        fail(f"chunk_seconds mismatch: response says {data['chunk_seconds']}, expected {chunk_seconds}")

    import math
    expected_chunk_count = math.ceil(expected_duration / chunk_seconds)
    if data["chunk_count"] != expected_chunk_count:
        fail(f"chunk_count mismatch: got {data['chunk_count']}, expected {expected_chunk_count} "
             f"(duration={expected_duration}s / chunk_seconds={chunk_seconds}s)")

    if abs(data["audio_duration"] - expected_duration) > 1.0:
        fail(f"audio_duration off by more than 1s: got {data['audio_duration']}, expected ~{expected_duration}")

    # --- Per-chunk shape + ordering + timestamp continuity ------------------
    prev_end = 0.0
    for i, chunk in enumerate(data["chunks"]):
        for key in ["chunk_index", "chunk_start", "chunk_end", "text", "segments"]:
            if key not in chunk:
                fail(f"chunk {i} missing key '{key}'")

        if chunk["chunk_index"] != i:
            fail(f"chunk {i} has chunk_index={chunk['chunk_index']}, expected {i} (out of order?)")

        expected_start = i * chunk_seconds
        if abs(chunk["chunk_start"] - expected_start) > 0.01:
            fail(f"chunk {i} chunk_start={chunk['chunk_start']}, expected {expected_start}")

        # No gaps or overlaps between consecutive chunks
        if abs(chunk["chunk_start"] - prev_end) > 0.01:
            fail(f"chunk {i} starts at {chunk['chunk_start']} but previous chunk ended at {prev_end} "
                 f"(gap or overlap detected)")
        prev_end = chunk["chunk_end"]

        # Segment timestamps must be globally offset, not reset to 0 per chunk
        # (except legitimately for chunk 0)
        if i > 0 and chunk["segments"]:
            first_seg_start = chunk["segments"][0]["start"]
            if first_seg_start < expected_start - 0.01:
                fail(f"chunk {i} segment timestamps look un-offset "
                     f"(first segment starts at {first_seg_start}, but chunk begins at global {expected_start})")

    # Last chunk should end at (approximately) the full audio duration
    last_end = data["chunks"][-1]["chunk_end"]
    if abs(last_end - expected_duration) > 1.0:
        fail(f"Last chunk ends at {last_end}, expected ~{expected_duration} (full audio duration)")

    print(f"OK: {data['chunk_count']} chunks, audio_duration={data['audio_duration']}s, "
          f"chunk_seconds={data['chunk_seconds']}s, timestamps continuous and globally offset")
    sys.exit(0)

if __name__ == "__main__":
    main()