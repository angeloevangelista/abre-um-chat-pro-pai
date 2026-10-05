import { useCallback, useEffect, useRef, useState } from 'react'
import Peer, { type DataConnection } from 'peerjs'
import type { Asset, ChatMessage, GuestToHost, HostToGuest, Participant } from '../types'
import { guestStorage } from '../lib/storage'
import { saveBlob } from '../lib/utils'

export type GuestStatus = 'connecting' | 'connected' | 'offline'

const RETRY_MS = 4000
const OPEN_TIMEOUT_MS = 15000

export function useGuest(hostPeerId: string, name: string) {
  const [status, setStatus] = useState<GuestStatus>('connecting')
  const [me, setMe] = useState<Participant | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [downloading, setDownloading] = useState<Set<string>>(() => new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const connRef = useRef<DataConnection | null>(null)

  const finishDownload = (assetId: string) =>
    setDownloading((prev) => {
      const next = new Set(prev)
      next.delete(assetId)
      return next
    })

  useEffect(() => {
    let destroyed = false
    let retryTimer: number | undefined
    let openTimer: number | undefined
    const peer = new Peer()

    const handle = (msg: HostToGuest) => {
      switch (msg.type) {
        case 'welcome':
          setMe(msg.you)
          setMessages(msg.messages)
          setAssets(msg.assets)
          setParticipants(msg.participants)
          setStatus('connected')
          setNotice(null)
          break
        case 'message':
          setMessages((prev) => [...prev, msg.message])
          break
        case 'messages':
          setMessages(msg.messages)
          break
        case 'assets':
          setAssets(msg.assets)
          break
        case 'participants':
          setParticipants(msg.participants)
          break
        case 'file-data':
          saveBlob(new Blob([msg.data], { type: msg.mime }), msg.fileName)
          finishDownload(msg.assetId)
          break
        case 'file-error':
          setNotice(msg.reason)
          finishDownload(msg.assetId)
          break
      }
    }

    const dropConnection = () => {
      const conn = connRef.current
      connRef.current = null
      window.clearTimeout(openTimer)
      conn?.close()
    }

    const scheduleRetry = () => {
      if (destroyed) return
      dropConnection()
      setStatus('offline')
      setDownloading(new Set())
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(connect, RETRY_MS)
    }

    function connect() {
      if (destroyed || peer.destroyed) return
      if (peer.disconnected) {
        peer.reconnect() // 'open' fires again and calls connect()
        return
      }
      dropConnection()
      const conn = peer.connect(hostPeerId, { reliable: true })
      connRef.current = conn
      openTimer = window.setTimeout(() => connRef.current === conn && !conn.open && scheduleRetry(), OPEN_TIMEOUT_MS)

      conn.on('open', () => {
        window.clearTimeout(openTimer)
        conn.send({ type: 'hello', clientId: guestStorage.getClientId(), name } satisfies GuestToHost)
      })
      conn.on('data', (data) => handle(data as HostToGuest))
      conn.on('close', () => connRef.current === conn && scheduleRetry())
      conn.on('error', () => connRef.current === conn && scheduleRetry())
    }

    peer.on('open', connect)
    peer.on('error', (err) => {
      if (destroyed) return
      // peer-unavailable = host is not online right now.
      if (err.type !== 'browser-incompatible') scheduleRetry()
    })

    return () => {
      destroyed = true
      window.clearTimeout(retryTimer)
      dropConnection()
      peer.destroy()
    }
  }, [hostPeerId, name])

  const send = (msg: GuestToHost) => {
    const conn = connRef.current
    if (!conn?.open) return false
    conn.send(msg)
    return true
  }

  const sendMessage = useCallback((text: string) => {
    const value = text.trim()
    if (value) send({ type: 'chat', text: value })
  }, [])

  const requestFile = useCallback((assetId: string) => {
    if (send({ type: 'file-request', assetId })) {
      setDownloading((prev) => new Set(prev).add(assetId))
    }
  }, [])

  return {
    status,
    me,
    messages,
    assets,
    participants,
    downloading,
    notice,
    dismissNotice: () => setNotice(null),
    sendMessage,
    requestFile,
  }
}
