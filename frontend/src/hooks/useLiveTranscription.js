import { useRef, useState, useCallback } from 'react'

// Deepgram's linear16 streaming works best at 16kHz mono — lower bandwidth,
// lower latency, and it's the sample rate their models are tuned for.
const SAMPLE_RATE = 16000

// WS_BASE should point at your FastAPI backend's WebSocket endpoint.
// In dev, Nginx proxies this same-origin, same as your REST calls.
const WS_BASE = import.meta.env.VITE_WS_URL || (
  window.location.protocol === 'https:' ? 'wss://' : 'ws://'
) + window.location.host

/**
 * useLiveTranscription
 *
 * Handles the entire browser-side half of live transcription:
 *   1. Opens a WebSocket to our backend (which relays audio to Deepgram —
 *      built in the next step).
 *   2. Captures microphone audio via the Web Audio API + AudioWorklet.
 *   3. Streams raw PCM audio frames to the backend continuously.
 *   4. Listens for transcript events coming back and exposes them as state,
 *      so any component using this hook can just render `segments` live.
 *
 * Analogy: this hook is the "front desk" of the whole live pipeline — it
 * doesn't do the transcribing itself, it just opens the phone line (mic +
 * WebSocket) and relays what comes back to whoever's listening (your UI).
 */
export function useLiveTranscription({ token, meetingId }) {
  const [status, setStatus] = useState('idle') // idle | connecting | live | error | stopped
  const [segments, setSegments] = useState([])  // [{ speaker, text, isFinal }]
  const [error, setError] = useState(null)

  const wsRef = useRef(null)
  const audioContextRef = useRef(null)
  const workletNodeRef = useRef(null)
  const streamRef = useRef(null)
  const sourceNodeRef = useRef(null)

  const start = useCallback(async () => {
    if (status === 'connecting' || status === 'live') return

    setStatus('connecting')
    setError(null)
    setSegments([])

    try {
      // 1. Open the WebSocket to our backend first, so we're not holding
      //    the mic open while waiting on a connection that might fail.
      //    Browsers can't send custom headers on WebSocket handshakes, so
      //    auth goes as a query param — the backend must validate it there.
      const ws = new WebSocket(
        `${WS_BASE}/meetings/${meetingId}/live?token=${encodeURIComponent(token)}`
      )
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      await new Promise((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onclose = (event) => {
          // event.code is only meaningful for connections that completed
          // the handshake — which is exactly what the accept-then-close
          // fix on the backend guarantees for auth failures.
          if (event.code === 4401) {
            reject(new Error('SESSION_EXPIRED'))
          } else {
            reject(new Error('Could not connect to live transcription server'))
          }
        }
        ws.onerror = () => {
          // onerror fires alongside onclose but never carries a code —
          // let the onclose handler above supply the real reason instead
          // of rejecting twice with two different messages.
        }
      })

      ws.onmessage = (event) => {
        // Backend sends JSON text messages for transcript/speaker events —
        // never binary in this direction, only browser -> backend is binary.
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'transcript') {
            setSegments(prev => {
              // Replace the last interim segment from the same speaker
              // instead of appending endlessly — Deepgram sends the same
              // sentence repeatedly, refining it, until it's marked final.
              const next = [...prev]
              const lastIdx = next.length - 1
              if (lastIdx >= 0 && !next[lastIdx].isFinal && next[lastIdx].speaker === msg.speaker) {
                next[lastIdx] = { speaker: msg.speaker, text: msg.text, isFinal: msg.is_final }
              } else {
                next.push({ speaker: msg.speaker, text: msg.text, isFinal: msg.is_final })
              }
              return next
            })
          }
        } catch {
          console.error('Received malformed message from live transcription server')
        }
      }

      ws.onclose = () => {
        setStatus(prev => (prev === 'live' ? 'stopped' : prev))
      }

      // 2. Now that the WebSocket is confirmed open, request the mic.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      streamRef.current = stream

      // 3. Set up the Web Audio graph: mic -> AudioWorklet (PCM converter) -> our code
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
      audioContextRef.current = audioContext

      await audioContext.audioWorklet.addModule('/pcm-processor.js')

      const sourceNode = audioContext.createMediaStreamSource(stream)
      sourceNodeRef.current = sourceNode

      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor')
      workletNodeRef.current = workletNode

      // Every time the worklet hands us a chunk of PCM bytes, forward it
      // straight to the backend over the already-open WebSocket.
      workletNode.port.onmessage = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data) // raw ArrayBuffer, binary frame
        }
      }

      sourceNode.connect(workletNode)
      // Note: we deliberately do NOT connect workletNode to audioContext.destination —
      // doing so would play the mic audio back out the speakers (feedback loop).

      setStatus('live')
    } catch (err) {
      console.error('Failed to start live transcription:', err)
      setError(err.message)
      setStatus('error')
      stop() // clean up any partially-opened resources
    }
  }, [status, token, meetingId])

  const stop = useCallback(() => {
    workletNodeRef.current?.disconnect()
    sourceNodeRef.current?.disconnect()
    audioContextRef.current?.close()
    streamRef.current?.getTracks().forEach(t => t.stop())

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Tell the backend this is a deliberate stop, not a dropped connection.
      // The backend should finalize the transcript and trigger analysis only
      // when it receives this message — a raw socket close (e.g. wifi drop,
      // tab crash) should NOT trigger finalization, since the recording may
      // resume or the user may not have meant to end the meeting.
      //
      // Analogy: this is like saying "goodbye, I'm done" before hanging up
      // the phone, instead of the call just going dead — the person on the
      // other end needs to know which one happened before they act on it.
      wsRef.current.send(JSON.stringify({ type: 'end' }))
      wsRef.current.close()
    }

    workletNodeRef.current = null
    sourceNodeRef.current = null
    audioContextRef.current = null
    streamRef.current = null
    wsRef.current = null

    setStatus(prev => (prev === 'error' ? 'error' : 'stopped'))
  }, [])

  return { start, stop, status, segments, error }
}