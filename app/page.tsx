'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { parseLrc, getCurrentLineIndex, type LrcLine } from '@/lib/lrc'

interface Song {
  title: string
  artist: string
  album: string
  offsetSeconds: number
  detectedAt: number
}

type Status = 'idle' | 'requesting' | 'listening' | 'identifying' | 'error'

// 4 seconds keeps PCM payload under 500KB (Shazam's limit)
const RECORD_MS = 4000
// 30 seconds between polls to stay within free tier (500 req/month)
const POLL_MS = 30000

export default function Home() {
  const [status, setStatus] = useState<Status>('idle')
  const [song, setSong] = useState<Song | null>(null)
  const [lines, setLines] = useState<LrcLine[]>([])
  const [plain, setPlain] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [micError, setMicError] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const songRef = useRef<Song | null>(null)
  const recordingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    songRef.current = song
  }, [song])

  const identify = useCallback(async () => {
    if (recordingRef.current || !streamRef.current) return
    recordingRef.current = true
    setStatus('identifying')

    try {
      const stream = streamRef.current

      // Shazam requires 44100Hz mono 16-bit PCM — capture via Web Audio API
      const audioCtx = new AudioContext({ sampleRate: 44100 })
      const source = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      const silence = audioCtx.createGain()
      silence.gain.value = 0

      const floatChunks: Float32Array[] = []
      processor.onaudioprocess = (e) => {
        floatChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }

      source.connect(processor)
      processor.connect(silence)
      silence.connect(audioCtx.destination)

      await new Promise<void>((resolve) => setTimeout(resolve, RECORD_MS))

      processor.disconnect()
      source.disconnect()
      audioCtx.close()

      if (!floatChunks.length) return

      // Merge chunks and convert Float32 → Int16 PCM
      const totalSamples = floatChunks.reduce((s, c) => s + c.length, 0)
      const float32 = new Float32Array(totalSamples)
      let pos = 0
      for (const chunk of floatChunks) { float32.set(chunk, pos); pos += chunk.length }

      const int16 = new Int16Array(float32.length)
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
      }

      // Base64 encode the raw PCM bytes
      const uint8 = new Uint8Array(int16.buffer)
      let binary = ''
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
      const audio = btoa(binary)

      const r = await fetch('/api/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio }),
      })
      if (!r.ok) return

      const data = await r.json()
      const newSong: Song = {
        title: data.title,
        artist: data.artist,
        album: data.album,
        offsetSeconds: data.offsetSeconds + RECORD_MS / 1000,
        detectedAt: Date.now(),
      }

      const prev = songRef.current
      const isNew = !prev || prev.title !== newSong.title || prev.artist !== newSong.artist

      setSong(newSong)

      if (isNew) {
        setLines([])
        setPlain(null)
        setCurrent(0)
        setElapsed(newSong.offsetSeconds)

        const params = new URLSearchParams({
          title: newSong.title,
          artist: newSong.artist,
          album: newSong.album,
        })
        const lr = await fetch(`/api/lyrics?${params}`)
        if (lr.ok) {
          const ld = await lr.json()
          if (ld.synced) setLines(parseLrc(ld.synced))
          else if (ld.plain) setPlain(ld.plain)
        }
      }
    } catch (e) {
      console.error('identify error:', e)
    } finally {
      recordingRef.current = false
      setStatus('listening')
    }
  }, [])

  // Init mic and polling loop
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>
    setStatus('requesting')

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        streamRef.current = stream
        setStatus('listening')
        identify()
        intervalId = setInterval(identify, POLL_MS)
      })
      .catch(() => {
        setMicError(true)
        setStatus('error')
      })

    return () => {
      clearInterval(intervalId)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [identify])

  // Tick song position every 100ms
  useEffect(() => {
    if (!song) return
    const interval = setInterval(() => {
      setElapsed((Date.now() - song.detectedAt) / 1000 + song.offsetSeconds)
    }, 100)
    return () => clearInterval(interval)
  }, [song])

  // Derive current lyric line from elapsed time
  useEffect(() => {
    if (!lines.length) return
    setCurrent(getCurrentLineIndex(lines, elapsed))
  }, [elapsed, lines])

  // Scroll current line to center of the container
  useEffect(() => {
    const el = lineRefs.current[current]
    const container = containerRef.current
    if (!el || !container) return
    const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2
    container.scrollTo({ top, behavior: 'smooth' })
  }, [current])

  const statusLabel: Record<Status, string> = {
    idle: '',
    requesting: 'Requesting microphone…',
    listening: 'Listening…',
    identifying: 'Identifying song…',
    error: 'Microphone access denied',
  }

  return (
    <main className="h-full flex flex-col overflow-hidden select-none bg-black text-white">
      {/* Song header */}
      {song && (
        <div className="flex-shrink-0 px-10 pt-10 pb-2">
          <p className="text-5xl font-bold tracking-tight leading-tight">{song.title}</p>
          <p className="text-2xl mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {song.artist}
          </p>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 relative overflow-hidden">
        {/* Top fade overlay */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24"
          style={{ background: 'linear-gradient(to bottom, #000, transparent)' }}
        />
        {/* Bottom fade overlay */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24"
          style={{ background: 'linear-gradient(to top, #000, transparent)' }}
        />

        {/* Synced lyrics */}
        {lines.length > 0 && (
          <div
            ref={containerRef}
            className="absolute inset-0 overflow-y-auto"
            style={{ scrollbarWidth: 'none' } as React.CSSProperties}
          >
            <div className="px-10 py-48">
              {lines.map((line, i) => {
                const dist = i - current
                const isCurrent = dist === 0
                const opacity =
                  isCurrent ? 1
                  : dist === 1 ? 0.5
                  : Math.abs(dist) <= 3 ? 0.2
                  : 0.07
                const fontSize =
                  isCurrent ? '3rem'
                  : Math.abs(dist) === 1 ? '2.25rem'
                  : '1.875rem'
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      lineRefs.current[i] = el
                    }}
                    className="py-3 leading-tight transition-all duration-500 ease-out"
                    style={{ opacity, fontSize, fontWeight: isCurrent ? 700 : 400 }}
                  >
                    {line.text}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Plain lyrics (no timestamps available) */}
        {!lines.length && plain && (
          <div
            className="absolute inset-0 overflow-y-auto px-10 py-10"
            style={{ scrollbarWidth: 'none' } as React.CSSProperties}
          >
            <p
              className="text-2xl leading-relaxed whitespace-pre-line"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              {plain}
            </p>
          </div>
        )}

        {/* Listening / idle state */}
        {!lines.length && !plain && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
            {micError ? (
              <p className="text-2xl text-red-400 text-center px-8">
                Microphone access denied. Please allow microphone access and refresh.
              </p>
            ) : (
              <>
                <div className="flex gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full animate-bounce"
                      style={{
                        background: 'rgba(255,255,255,0.3)',
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
                {song ? (
                  <p className="text-2xl" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {song.title} · {song.artist}
                  </p>
                ) : (
                  <p className="text-xl" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {statusLabel[status]}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        className="flex-shrink-0 px-10 pb-6 pt-2 flex justify-between items-center text-sm"
        style={{ color: 'rgba(255,255,255,0.15)' }}
      >
        <span>{statusLabel[status]}</span>
        <span>lyric wall</span>
      </div>
    </main>
  )
}
