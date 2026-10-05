import {
  AudioSample,
  AudioSampleSource,
  CanvasSource,
  NullTarget,
  Output,
  QUALITY_LOW,
  WebMOutputFormat,
} from 'mediabunny'
import type { ChatMessage, Participant } from '../types'
import { formatTime } from './utils'

/**
 * The chat as a live video, so it can float in the browser's native video
 * Picture-in-Picture (always on top, also in Arc/Safari).
 *
 * It is deliberately a *regular* video, the way YouTube serves one: frames of the
 * chat canvas are encoded to WebM (VP8 + Opus) and appended to a MediaSource.
 * Browsers' automatic mini players (Arc) ignore canvas/WebRTC streams but pick up
 * this kind of playback. Auto-float also only happens for *audible* media, so the
 * audio track is a tone far too low and quiet to hear that still counts as sound.
 */

export interface ChatSnapshot {
  title: string
  online: boolean
  messages: ChatMessage[]
  me: Participant | null
}

const W = 360
const H = 540
const SCALE = 2
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
const HEADER = 40
const FOOTER = 26
const PAD = 12
const LINE = 19

// 30 Hz at -50 dBFS: below what laptop speakers reproduce and far below hearing
// at that level, yet above Chromium's silence threshold (about -72 dBFS).
const TONE_HZ = 30
const TONE_GAIN = 0.003
const SAMPLE_RATE = 48000
const FPS = 4
const MIME = 'video/webm; codecs="vp8, opus"'
/** How far behind the live edge playback may drift before we jump forward. */
const MAX_LAG_S = 1.5
/** Seconds of already-played video kept in the buffer. */
const KEEP_S = 20

function theme() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    surface: v('--surface'),
    text: v('--text'),
    muted: v('--muted'),
    bubble: v('--bubble'),
    mine: v('--mine'),
    mineText: v('--mine-text'),
    border: v('--border'),
    ok: v('--ok'),
    accent: v('--accent'),
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      const candidate = line + word
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate
        continue
      }
      if (line.trim()) lines.push(line.trimEnd())
      line = word.trimStart()
      // A single word wider than the bubble: hard-break it.
      while (ctx.measureText(line).width > maxWidth) {
        let cut = line.length - 1
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}

function draw(ctx: CanvasRenderingContext2D, chat: ChatSnapshot) {
  const t = theme()
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
  ctx.fillStyle = t.surface
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'top'

  // Messages, laid out bottom-up so the newest is always visible.
  const bubbleMax = W * 0.78 - 20
  let y = H - FOOTER - PAD
  for (let i = chat.messages.length - 1; i >= 0 && y > HEADER; i--) {
    const m = chat.messages[i]
    if (m.kind === 'system') {
      ctx.font = `12px ${FONT}`
      ctx.fillStyle = t.muted
      ctx.textAlign = 'center'
      const lines = wrap(ctx, `${m.text} · ${formatTime(m.ts)}`, W - PAD * 4)
      y -= lines.length * 16
      lines.forEach((l, j) => ctx.fillText(l, W / 2, y + j * 16))
      ctx.textAlign = 'left'
      y -= 10
      continue
    }

    const mine = m.authorId === chat.me?.id
    const prev = chat.messages[i - 1]
    const grouped = prev?.kind === 'chat' && prev.authorId === m.authorId && m.ts - prev.ts < 120_000

    ctx.font = `14px ${FONT}`
    const lines = wrap(ctx, m.text, bubbleMax)
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width))
    const bw = Math.ceil(textW) + 20
    const bh = lines.length * LINE + 14
    y -= bh
    const bx = mine ? W - PAD - bw : PAD
    ctx.fillStyle = mine ? t.mine : t.bubble
    ctx.beginPath()
    ctx.roundRect(bx, y, bw, bh, 12)
    ctx.fill()
    ctx.fillStyle = mine ? t.mineText : t.text
    lines.forEach((l, j) => ctx.fillText(l, bx + 10, y + 7 + j * LINE))

    if (!grouped) {
      y -= 18
      ctx.font = `600 12px ${FONT}`
      const name = mine ? 'You' : (m.authorName ?? '')
      const meta = `${name}${m.authorId === 'host' ? ' · host' : ''}`
      const time = formatTime(m.ts)
      ctx.fillStyle = t.text
      if (mine) {
        ctx.font = `12px ${FONT}`
        const tw = ctx.measureText(time).width
        ctx.fillStyle = t.muted
        ctx.fillText(time, W - PAD - tw, y)
        ctx.font = `600 12px ${FONT}`
        ctx.fillStyle = t.text
        ctx.fillText(meta, W - PAD - tw - 6 - ctx.measureText(meta).width, y)
      } else {
        ctx.fillText(meta, PAD, y)
        const mw = ctx.measureText(meta).width
        ctx.font = `12px ${FONT}`
        ctx.fillStyle = t.muted
        ctx.fillText(time, PAD + mw + 6, y)
      }
      y -= 10
    } else {
      y -= 4
    }
  }

  if (chat.messages.length === 0) {
    ctx.font = `13px ${FONT}`
    ctx.fillStyle = t.muted
    ctx.textAlign = 'center'
    ctx.fillText('No messages yet', W / 2, H / 2)
    ctx.textAlign = 'left'
  }

  // Header (drawn last so it covers messages that scrolled off the top).
  ctx.fillStyle = t.surface
  ctx.fillRect(0, 0, W, HEADER)
  ctx.fillStyle = t.border
  ctx.fillRect(0, HEADER - 1, W, 1)
  ctx.fillStyle = chat.online ? t.ok : t.accent
  ctx.beginPath()
  ctx.arc(PAD + 4, HEADER / 2, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = `600 14px ${FONT}`
  ctx.fillStyle = t.text
  ctx.textBaseline = 'middle'
  ctx.fillText(chat.title, PAD + 16, HEADER / 2)

  // Footer hint.
  ctx.fillStyle = t.surface
  ctx.fillRect(0, H - FOOTER, W, FOOTER)
  ctx.fillStyle = t.border
  ctx.fillRect(0, H - FOOTER, W, 1)
  ctx.font = `11px ${FONT}`
  ctx.fillStyle = t.muted
  ctx.textAlign = 'center'
  ctx.fillText(chat.online ? 'Live · reply from the app tab' : 'Offline · waiting for the host…', W / 2, H - FOOTER / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
}

export class LiveChatVideo {
  readonly video = document.createElement('video')
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d')!
  private mediaSource = new MediaSource()
  private sourceBuffer: SourceBuffer | null = null
  private pending: Uint8Array<ArrayBuffer>[] = []
  private output: Output | null = null
  private videoSource: CanvasSource | null = null
  private audioSource: AudioSampleSource | null = null
  private startedAt = 0
  private samplesWritten = 0
  private ticking = false
  private timer: number | undefined
  private destroyed = false
  private chat: ChatSnapshot | null = null

  static supported() {
    return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(MIME) && 'VideoEncoder' in window
  }

  constructor() {
    this.canvas.width = W * SCALE
    this.canvas.height = H * SCALE
    Object.assign(this.video, { muted: false, volume: 1, playsInline: true })
    this.video.className = 'float-preview-video'
    this.video.src = URL.createObjectURL(this.mediaSource)
  }

  update(chat: ChatSnapshot) {
    this.chat = chat
    if (!this.destroyed) draw(this.ctx, chat)
  }

  /** Must run inside a click: starting audible playback needs a user gesture. */
  async start() {
    if (this.chat) draw(this.ctx, this.chat)
    // Claim playback while the click still counts as a user gesture; it actually
    // starts once the first video data is appended.
    const playing = this.video.play()

    await new Promise((resolve) => this.mediaSource.addEventListener('sourceopen', resolve, { once: true }))
    URL.revokeObjectURL(this.video.src)
    this.sourceBuffer = this.mediaSource.addSourceBuffer(MIME)
    this.sourceBuffer.addEventListener('updateend', () => this.flush())

    const push = (data: Uint8Array) => {
      this.pending.push(data.slice())
      this.flush()
    }
    this.output = new Output({
      format: new WebMOutputFormat({
        appendOnly: true,
        minimumClusterDuration: 0.5,
        onEbmlHeader: push,
        onSegmentHeader: push,
        onCluster: push,
      }),
      target: new NullTarget(),
    })
    this.videoSource = new CanvasSource(this.canvas, {
      codec: 'vp8',
      quality: QUALITY_LOW,
      keyFrameInterval: 1,
      latencyMode: 'realtime',
    })
    this.audioSource = new AudioSampleSource({ codec: 'opus', quality: QUALITY_LOW })
    this.output.addVideoTrack(this.videoSource, { frameRate: FPS })
    this.output.addAudioTrack(this.audioSource)
    await this.output.start()

    this.startedAt = performance.now()
    await this.tick()
    // Background tabs throttle timers to ~1/s; tick() catches up on audio either way.
    this.timer = window.setInterval(() => void this.tick(), 1000 / FPS)
    await playing
  }

  /** Encode everything up to "now": the audio that elapsed plus one chat frame. */
  private async tick() {
    if (this.ticking || this.destroyed || !this.videoSource || !this.audioSource) return
    this.ticking = true
    try {
      const now = (performance.now() - this.startedAt) / 1000
      const target = Math.floor(now * SAMPLE_RATE)
      while (this.samplesWritten < target) {
        const count = Math.min(target - this.samplesWritten, SAMPLE_RATE)
        const data = new Float32Array(count)
        for (let i = 0; i < count; i++) {
          data[i] = TONE_GAIN * Math.sin((2 * Math.PI * TONE_HZ * (this.samplesWritten + i)) / SAMPLE_RATE)
        }
        const sample = new AudioSample({
          data,
          format: 'f32',
          numberOfChannels: 1,
          sampleRate: SAMPLE_RATE,
          timestamp: this.samplesWritten / SAMPLE_RATE,
        })
        await this.audioSource.add(sample)
        sample.close()
        this.samplesWritten += count
      }
      await this.videoSource.add(now, 1 / FPS)
      this.keepLive()
    } catch (err) {
      if (!this.destroyed) console.error('Live chat video encoding failed', err)
    } finally {
      this.ticking = false
    }
  }

  private flush() {
    const sb = this.sourceBuffer
    if (!sb || sb.updating || this.destroyed) return
    const next = this.pending.shift()
    if (next) {
      sb.appendBuffer(next)
      return
    }
    // Idle: drop video that was already played so memory stays flat.
    const t = this.video.currentTime
    if (sb.buffered.length && t - sb.buffered.start(0) > KEEP_S * 2) sb.remove(0, t - KEEP_S)
  }

  private keepLive() {
    const { buffered } = this.video
    if (!buffered.length) return
    const end = buffered.end(buffered.length - 1)
    if (end - this.video.currentTime > MAX_LAG_S) this.video.currentTime = end - 0.3
    if (this.video.paused && !this.destroyed) void this.video.play().catch(() => {})
  }

  get floating() {
    return document.pictureInPictureElement === this.video
  }

  async float() {
    if (!this.floating) await this.video.requestPictureInPicture()
  }

  unfloat() {
    if (this.floating) void document.exitPictureInPicture().catch(() => {})
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    window.clearInterval(this.timer)
    void this.output?.cancel().catch(() => {})
    const teardown = () => {
      this.video.pause()
      this.video.removeAttribute('src')
      this.video.load()
      this.video.remove()
    }
    // Tearing the video down mid-float would leave the floating window behind.
    if (this.floating) void document.exitPictureInPicture().catch(() => {}).finally(teardown)
    else teardown()
  }
}
