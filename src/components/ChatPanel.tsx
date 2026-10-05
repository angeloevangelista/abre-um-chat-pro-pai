import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { ChatMessage, Participant } from '../types'
import { formatTime } from '../lib/utils'

const URL_RE = /(https?:\/\/[^\s<]+)/g

function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  )
}

interface Props {
  messages: ChatMessage[]
  me: Participant | null
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatPanel({ messages, me, onSend, disabled, placeholder }: Props) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (disabled || !draft.trim()) return
    onSend(draft)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="empty">No messages yet. Say hi!</p>}
        {messages.map((m, i) => {
          if (m.kind === 'system') {
            return (
              <div key={m.id} className="msg-system">
                {m.text} · {formatTime(m.ts)}
              </div>
            )
          }
          const mine = m.authorId === me?.id
          const prev = messages[i - 1]
          const grouped = prev?.kind === 'chat' && prev.authorId === m.authorId && m.ts - prev.ts < 120_000
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
              {!grouped && (
                <div className="msg-meta">
                  <strong>{mine ? 'You' : m.authorName}</strong>
                  {m.authorId === 'host' && <span className="badge">host</span>}
                  <span>{formatTime(m.ts)}</span>
                </div>
              )}
              <div className="msg-bubble">
                <Linkified text={m.text} />
              </div>
            </div>
          )
        })}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <textarea
          rows={1}
          value={draft}
          maxLength={2000}
          disabled={disabled}
          placeholder={placeholder ?? 'Type a message…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="btn primary" disabled={disabled || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
