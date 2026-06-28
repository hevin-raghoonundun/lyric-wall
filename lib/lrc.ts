export interface LrcLine {
  time: number
  text: string
}

export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = []
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/\[(\d{2}):(\d{2}\.\d+)\](.*)/)
    if (!m) continue
    const time = parseInt(m[1]) * 60 + parseFloat(m[2])
    const text = m[3].trim()
    if (text) lines.push({ time, text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

export function getCurrentLineIndex(lines: LrcLine[], elapsed: number): number {
  let idx = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= elapsed) idx = i
    else break
  }
  return idx
}
