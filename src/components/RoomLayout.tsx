import type { ReactNode } from 'react'

interface Props {
  title: string
  statusLabel: string
  online: boolean
  pipEnabled: boolean
  onPipToggle: () => void
  banner?: ReactNode
  chat: ReactNode
  sidebar: ReactNode
  headerExtra?: ReactNode
}

export function RoomLayout({ title, statusLabel, online, pipEnabled, onPipToggle, banner, chat, sidebar, headerExtra }: Props) {
  return (
    <div className="room">
      <header className="room-header">
        <div className="room-title">
          <h1>{title}</h1>
          <span className="status">
            <span className={`dot ${online ? 'on' : 'off'}`} />
            {statusLabel}
          </span>
        </div>
        <div className="header-actions">
          <button
            className={`btn ${pipEnabled ? 'accent' : ''}`}
            aria-pressed={pipEnabled}
            onClick={onPipToggle}
            title="When on, the chat floats over other tabs while you're away from this one"
          >
            {pipEnabled ? 'Picture it! · On' : 'Picture it!'}
          </button>
          {headerExtra}
        </div>
      </header>
      {banner}
      <main className="room-main">
        <section className="room-chat">{chat}</section>
        <aside className="room-side">{sidebar}</aside>
      </main>
    </div>
  )
}
