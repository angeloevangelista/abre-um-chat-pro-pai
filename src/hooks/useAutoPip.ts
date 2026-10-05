import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatSnapshot, LiveChatVideo } from '../lib/videoPip'

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(options?: { width?: number; height?: number }): Promise<Window>
      window: Window | null
    }
  }
}

/** Arc exposes the Document PiP API, but its window hides when you switch tabs. */
function isArc() {
  return getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title').trim() !== ''
}

function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.document.createElement('style')
      style.textContent = Array.from(sheet.cssRules, (r) => r.cssText).join('\n')
      target.document.head.appendChild(style)
    } catch {
      if (sheet.href) {
        const link = target.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.document.head.appendChild(link)
      }
    }
  }
}

function setPipHandler(handler: (() => void) | null) {
  try {
    navigator.mediaSession?.setActionHandler('enterpictureinpicture' as MediaSessionAction, handler)
  } catch {
    // Browser doesn't know this action (Safari, Firefox): it relies on its own auto-PiP.
  }
}

/**
 * Google Meet–style floating chat. Enabling it (a click) starts an audible-to-the-
 * browser live chat video; from then on, leaving the tab floats the chat and coming
 * back closes it. Nothing floats while it's disabled.
 *
 * The float is opened from the Media Session "enterpictureinpicture" action, which
 * the browser fires on tab switch without a user gesture; browsers with their own
 * automatic PiP (Arc's mini player) float the playing video directly.
 */
export function useAutoPip(chat: ChatSnapshot) {
  const [enabled, setEnabled] = useState(false)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const liveRef = useRef<LiveChatVideo | null>(null)
  const winRef = useRef<Window | null>(null)
  const slotRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    liveRef.current?.update(chat)
    if ('mediaSession' in navigator && liveRef.current) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: chat.title, artist: 'Live chat' })
    }
  }, [chat])

  /** Ref callback for the element that shows the live preview video. */
  const previewSlot = useCallback((el: HTMLElement | null) => {
    slotRef.current = el
    if (el && liveRef.current) el.appendChild(liveRef.current.video)
  }, [])

  const unfloat = useCallback(() => {
    winRef.current?.close()
    winRef.current = null
    setContainer(null)
    liveRef.current?.unfloat()
  }, [])

  const float = useCallback(async () => {
    const live = liveRef.current
    if (!live || document.visibilityState === 'visible') return
    // Chrome/Edge: an interactive window you can type in.
    if (window.documentPictureInPicture && !isArc()) {
      try {
        const win = await window.documentPictureInPicture.requestWindow({ width: 360, height: 540 })
        const doc = win.document
        doc.title = 'Chat'
        copyStyles(win)
        doc.body.className = 'pip-body'
        const root = doc.createElement('div')
        root.className = 'pip-root'
        doc.body.appendChild(root)
        win.addEventListener('pagehide', () => {
          if (winRef.current !== win) return
          winRef.current = null
          setContainer(null)
        })
        winRef.current = win
        setContainer(root)
        return
      } catch {
        // Fall through to the video float.
      }
    }
    await live.float().catch((err) => console.warn('Auto-float was not allowed', err))
  }, [])

  const disable = useCallback(() => {
    unfloat()
    setPipHandler(null)
    liveRef.current?.destroy()
    liveRef.current = null
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
    setEnabled(false)
  }, [unfloat])

  const enable = useCallback(async () => {
    // Loaded on demand: the video encoder/muxer is most of the bundle.
    const { LiveChatVideo } = await import('../lib/videoPip')
    if (!LiveChatVideo.supported()) {
      alert('This browser cannot play the live chat video needed for Picture it!.')
      return
    }
    const live = new LiveChatVideo()
    liveRef.current = live
    live.update(chat)
    if (slotRef.current) slotRef.current.appendChild(live.video)
    try {
      await live.start()
    } catch (err) {
      console.error('Could not start the live chat video', err)
      live.destroy()
      liveRef.current = null
      return
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: chat.title, artist: 'Live chat' })
      navigator.mediaSession.playbackState = 'playing'
    }
    setPipHandler(() => void float())
    setEnabled(true)
  }, [chat, float])

  const toggle = useCallback(() => (enabled ? disable() : void enable()), [enabled, enable, disable])

  // Coming back to the tab puts the chat back in the page.
  useEffect(() => {
    if (!enabled) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') unfloat()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled, unfloat])

  useEffect(() => () => {
    winRef.current?.close()
    setPipHandler(null)
    liveRef.current?.destroy()
  }, [])

  return { enabled, toggle, previewSlot, container }
}
