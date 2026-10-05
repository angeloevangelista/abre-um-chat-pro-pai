import { useCallback, useEffect, useRef, useState } from 'react'
import Peer, { type DataConnection } from 'peerjs'
import type { Asset, ChatMessage, GuestToHost, HostToGuest, Participant } from '../types'
import { hostStorage } from '../lib/storage'
import { cleanName, saveBlob, uid } from '../lib/utils'

export const HOST_PARTICIPANT_ID = 'host'
const MAX_MESSAGES = 1000
const MAX_TEXT = 2000
export const MAX_FILE_BYTES = 100 * 1024 * 1024

export type HostStatus = 'starting' | 'online' | 'reconnecting' | 'error'

interface Guest {
  conn: DataConnection
  participant: Participant | null
}

const RETRYABLE = new Set(['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'])

export function useHost(hostName: string) {
  const [peerId] = useState(() => hostStorage.getPeerId())
  const [status, setStatus] = useState<HostStatus>('starting')
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(() => hostStorage.loadMessages())
  const [assets, setAssets] = useState<Asset[]>(() => hostStorage.loadAssets())
  // hostName is fixed for the lifetime of a session (HostRoom mounts once per name).
  const [me] = useState<Participant>(() => ({ id: HOST_PARTICIPANT_ID, name: hostName, isHost: true }))
  const [participants, setParticipants] = useState<Participant[]>([me])
  const meRef = useRef(me)
  const messagesRef = useRef(messages)
  const assetsRef = useRef(assets)
  const guests = useRef(new Map<string, Guest>())

  const broadcast = useCallback((msg: HostToGuest) => {
    for (const g of guests.current.values()) {
      if (g.participant && g.conn.open) g.conn.send(msg)
    }
  }, [])

  const pushMessage = useCallback(
    (message: ChatMessage) => {
      const next = [...messagesRef.current, message].slice(-MAX_MESSAGES)
      messagesRef.current = next
      setMessages(next)
      hostStorage.saveMessages(next)
      broadcast({ type: 'message', message })
    },
    [broadcast],
  )

  const system = useCallback(
    (text: string) => pushMessage({ id: uid(), kind: 'system', text, ts: Date.now() }),
    [pushMessage],
  )

  const commitAssets = useCallback(
    (next: Asset[]) => {
      assetsRef.current = next
      setAssets(next)
      hostStorage.saveAssets(next)
      broadcast({ type: 'assets', assets: next })
    },
    [broadcast],
  )

  const currentParticipants = useCallback((): Participant[] => {
    const seen = new Map<string, Participant>()
    for (const g of guests.current.values()) {
      if (g.participant) seen.set(g.participant.id, g.participant)
    }
    return [meRef.current, ...seen.values()]
  }, [])

  const syncParticipants = useCallback(() => {
    const list = currentParticipants()
    setParticipants(list)
    broadcast({ type: 'participants', participants: list })
  }, [broadcast, currentParticipants])

  // Peer lifecycle. The host keeps a stable peer id so the share link survives reloads.
  useEffect(() => {
    let destroyed = false
    let retryTimer: number | undefined
    let attempts = 0
    let peer: Peer | null = null
    const registry = guests.current

    const dropGuest = (guest: Guest) => {
      if (registry.get(guest.conn.connectionId) !== guest) return
      registry.delete(guest.conn.connectionId)
      const p = guest.participant
      if (p && ![...registry.values()].some((g) => g.participant?.id === p.id)) {
        system(`${p.name} left`)
      }
      syncParticipants()
    }

    const handleData = async (guest: Guest, msg: GuestToHost) => {
      const { conn } = guest
      if (!msg || typeof msg !== 'object') return

      if (msg.type === 'hello') {
        if (guest.participant) return
        const name = cleanName(msg.name)
        const clientId = typeof msg.clientId === 'string' ? msg.clientId.slice(0, 64) : ''
        if (!name || !clientId) return conn.close()

        // Same browser reconnecting (e.g. page refresh): replace the stale connection quietly.
        let rejoin = false
        for (const other of registry.values()) {
          if (other !== guest && other.participant?.id === clientId) {
            registry.delete(other.conn.connectionId)
            other.conn.close()
            rejoin = true
          }
        }

        guest.participant = { id: clientId, name }
        conn.send({
          type: 'welcome',
          you: guest.participant,
          messages: messagesRef.current,
          assets: assetsRef.current,
          participants: currentParticipants(),
        } satisfies HostToGuest)
        if (!rejoin) system(`${name} joined`)
        syncParticipants()
        return
      }

      const author = guest.participant
      if (!author) return

      if (msg.type === 'chat') {
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, MAX_TEXT) : ''
        if (!text) return
        pushMessage({ id: uid(), kind: 'chat', authorId: author.id, authorName: author.name, text, ts: Date.now() })
        return
      }

      if (msg.type === 'file-request') {
        const asset = assetsRef.current.find((a) => a.id === msg.assetId)
        const fail = (reason: string) =>
          conn.send({ type: 'file-error', assetId: msg.assetId, reason } satisfies HostToGuest)
        if (!asset || asset.kind !== 'file') return fail('This file is no longer shared.')
        const blob = await hostStorage.getFile(asset.id)
        if (!blob) return fail('The host no longer has this file.')
        conn.send({
          type: 'file-data',
          assetId: asset.id,
          fileName: asset.fileName,
          mime: asset.mime,
          data: await blob.arrayBuffer(),
        } satisfies HostToGuest)
      }
    }

    const start = () => {
      if (destroyed) return
      const p = new Peer(peerId)
      peer = p

      p.on('open', () => {
        attempts = 0
        setStatus('online')
        setError(null)
      })

      p.on('connection', (conn) => {
        const guest: Guest = { conn, participant: null }
        registry.set(conn.connectionId, guest)
        conn.on('data', (data) => void handleData(guest, data as GuestToHost))
        conn.on('close', () => dropGuest(guest))
        conn.on('error', () => dropGuest(guest))
      })

      // Lost the signalling server but the peer is alive: existing chats keep working.
      p.on('disconnected', () => {
        if (destroyed || p.destroyed) return
        setStatus('reconnecting')
        retryTimer = window.setTimeout(() => {
          if (!destroyed && !p.destroyed) p.reconnect()
        }, 1500)
      })

      p.on('error', (err) => {
        if (destroyed) return
        if (RETRYABLE.has(err.type) && attempts < 15) {
          attempts++
          setStatus('reconnecting')
          p.destroy()
          retryTimer = window.setTimeout(start, Math.min(1000 * attempts, 5000))
          return
        }
        if (err.type === 'peer-unavailable') return
        setStatus('error')
        setError(
          err.type === 'unavailable-id'
            ? 'This session is already open in another tab or window.'
            : err.message,
        )
      })
    }

    start()
    return () => {
      destroyed = true
      window.clearTimeout(retryTimer)
      registry.clear()
      peer?.destroy()
    }
  }, [peerId, system, pushMessage, syncParticipants, currentParticipants])

  const sendMessage = useCallback(
    (text: string) => {
      const value = text.trim().slice(0, MAX_TEXT)
      if (!value) return
      const author = meRef.current
      pushMessage({ id: uid(), kind: 'chat', authorId: author.id, authorName: author.name, text: value, ts: Date.now() })
    },
    [pushMessage],
  )

  const addLink = useCallback(
    (title: string, url: string) => {
      commitAssets([...assetsRef.current, { id: uid(), kind: 'link', title: title.trim() || url, url, ts: Date.now() }])
      system(`${meRef.current.name} shared a link: ${title.trim() || url}`)
    },
    [commitAssets, system],
  )

  const addFile = useCallback(
    async (file: File) => {
      const id = uid()
      await hostStorage.putFile(id, file)
      commitAssets([
        ...assetsRef.current,
        {
          id,
          kind: 'file',
          title: file.name,
          fileName: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          ts: Date.now(),
        },
      ])
      system(`${meRef.current.name} shared a file: ${file.name}`)
    },
    [commitAssets, system],
  )

  const removeAsset = useCallback(
    (id: string) => {
      const asset = assetsRef.current.find((a) => a.id === id)
      if (!asset) return
      if (asset.kind === 'file') void hostStorage.deleteFile(id)
      commitAssets(assetsRef.current.filter((a) => a.id !== id))
    },
    [commitAssets],
  )

  const downloadFile = useCallback(async (id: string) => {
    const asset = assetsRef.current.find((a) => a.id === id)
    if (asset?.kind !== 'file') return
    const blob = await hostStorage.getFile(id)
    if (blob) saveBlob(blob, asset.fileName)
  }, [])

  const clearChat = useCallback(() => {
    messagesRef.current = []
    setMessages([])
    hostStorage.saveMessages([])
    broadcast({ type: 'messages', messages: [] })
  }, [broadcast])

  return {
    peerId,
    status,
    error,
    me,
    messages,
    assets,
    participants,
    sendMessage,
    addLink,
    addFile,
    removeAsset,
    downloadFile,
    clearChat,
  }
}
