export interface Participant {
  id: string
  name: string
  isHost?: boolean
}

export interface ChatMessage {
  id: string
  kind: 'chat' | 'system'
  authorId?: string
  authorName?: string
  text: string
  ts: number
}

export type Asset =
  | { id: string; kind: 'link'; title: string; url: string; ts: number }
  | {
      id: string
      kind: 'file'
      title: string
      fileName: string
      size: number
      mime: string
      ts: number
    }

/** Messages a guest sends to the host. */
export type GuestToHost =
  | { type: 'hello'; clientId: string; name: string }
  | { type: 'chat'; text: string }
  | { type: 'file-request'; assetId: string }

/** Messages the host sends to guests. */
export type HostToGuest =
  | {
      type: 'welcome'
      you: Participant
      messages: ChatMessage[]
      assets: Asset[]
      participants: Participant[]
    }
  | { type: 'message'; message: ChatMessage }
  | { type: 'messages'; messages: ChatMessage[] }
  | { type: 'assets'; assets: Asset[] }
  | { type: 'participants'; participants: Participant[] }
  | { type: 'file-data'; assetId: string; fileName: string; mime: string; data: ArrayBuffer }
  | { type: 'file-error'; assetId: string; reason: string }
