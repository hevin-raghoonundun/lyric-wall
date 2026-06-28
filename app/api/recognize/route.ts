import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const audio = formData.get('audio') as Blob | null

  if (!audio) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
  }

  const host = process.env.ACR_HOST
  const accessKey = process.env.ACR_ACCESS_KEY
  const accessSecret = process.env.ACR_ACCESS_SECRET

  if (!host || !accessKey || !accessSecret) {
    return NextResponse.json({ error: 'ACRCloud credentials not configured' }, { status: 500 })
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const dataType = 'audio'
  const signatureVersion = '1'

  const stringToSign = ['POST', '/v1/identify', accessKey, dataType, signatureVersion, timestamp].join('\n')
  const signature = crypto.createHmac('sha1', accessSecret).update(stringToSign).digest('base64')

  const audioBuffer = Buffer.from(await audio.arrayBuffer())

  const body = new FormData()
  body.append('sample', new Blob([audioBuffer]), 'clip.webm')
  body.append('access_key', accessKey)
  body.append('data_type', dataType)
  body.append('signature_version', signatureVersion)
  body.append('signature', signature)
  body.append('sample_bytes', String(audioBuffer.length))
  body.append('timestamp', String(timestamp))

  const res = await fetch(`https://${host}/v1/identify`, { method: 'POST', body })
  const data = await res.json()

  if (data.status?.code !== 0 || !data.metadata?.music?.length) {
    return NextResponse.json({ error: 'Not recognized' }, { status: 404 })
  }

  const track = data.metadata.music[0]
  return NextResponse.json({
    title: track.title ?? '',
    artist: track.artists?.[0]?.name ?? '',
    album: track.album?.name ?? '',
    offsetSeconds: (track.play_offset_ms ?? 0) / 1000,
  })
}
