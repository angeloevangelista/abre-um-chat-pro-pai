import { createPortal } from 'react-dom'
import type { ChatMessage, Participant } from '../types'
import { ChatPanel } from './ChatPanel'

interface Props {
  container: HTMLElement
  title: string
  online: boolean
  messages: ChatMessage[]
  me: Participant | null
  onSend: (text: string) => void
}

/** The chat rendered live into the floating Picture-in-Picture window. */
export function PipChat({ container, title, online, ...chat }: Props) {
  return createPortal(
    <div className="pip-shell">
      <header className="pip-header">
        <span className={`dot ${online ? 'on' : 'off'}`} />
        <strong>{title}</strong>
      </header>
      <ChatPanel {...chat} disabled={!online} placeholder={online ? undefined : 'Host is offline…'} />
    </div>,
    container,
  )
}
