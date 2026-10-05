import { createStore, del, get, set, clear } from 'idb-keyval'
import type { Asset, ChatMessage } from '../types'
import { uid } from './utils'

// Small JSON state (chat, asset metadata) lives in localStorage.
// File bytes live in IndexedDB: localStorage caps around 5MB of strings.
const KEYS = {
  peerId: 'host.peerId',
  name: 'host.name',
  messages: 'host.messages',
  assets: 'host.assets',
  guestName: 'guest.name',
  guestClientId: 'guest.clientId',
}

const files = createStore('abre-um-chat', 'files')

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.error(`Could not persist ${key}`, err)
  }
}

export const hostStorage = {
  getPeerId(): string {
    let id = localStorage.getItem(KEYS.peerId)
    if (!id) {
      id = uid('abre-chat-')
      localStorage.setItem(KEYS.peerId, id)
    }
    return id
  },
  getName: () => localStorage.getItem(KEYS.name) ?? '',
  setName: (name: string) => localStorage.setItem(KEYS.name, name),
  loadMessages: () => loadJSON<ChatMessage[]>(KEYS.messages, []),
  saveMessages: (messages: ChatMessage[]) => saveJSON(KEYS.messages, messages),
  loadAssets: () => loadJSON<Asset[]>(KEYS.assets, []),
  saveAssets: (assets: Asset[]) => saveJSON(KEYS.assets, assets),
  putFile: (id: string, blob: Blob) => set(id, blob, files),
  getFile: (id: string) => get<Blob>(id, files),
  deleteFile: (id: string) => del(id, files),
  async wipe() {
    for (const key of [KEYS.peerId, KEYS.name, KEYS.messages, KEYS.assets]) {
      localStorage.removeItem(key)
    }
    await clear(files)
  },
}

export const guestStorage = {
  getName: () => localStorage.getItem(KEYS.guestName) ?? '',
  setName: (name: string) => localStorage.setItem(KEYS.guestName, name),
  getClientId(): string {
    let id = localStorage.getItem(KEYS.guestClientId)
    if (!id) {
      id = uid('guest-')
      localStorage.setItem(KEYS.guestClientId, id)
    }
    return id
  },
}
