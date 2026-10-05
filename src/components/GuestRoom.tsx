import { useMemo } from 'react'
import { useGuest, type GuestStatus } from '../hooks/useGuest'
import { useAutoPip } from '../hooks/useAutoPip'
import { AssetsPanel } from './AssetsPanel'
import { FloatPanel } from './FloatPanel'
import { ChatPanel } from './ChatPanel'
import { ParticipantsPanel } from './ParticipantsPanel'
import { PipChat } from './PipChat'
import { RoomLayout } from './RoomLayout'

const STATUS_LABEL: Record<GuestStatus, string> = {
  connecting: 'Connecting to host…',
  connected: 'Connected',
  offline: 'Host offline · retrying…',
}

export function GuestRoom({ hostPeerId, name, onLeave }: { hostPeerId: string; name: string; onLeave: () => void }) {
  const guest = useGuest(hostPeerId, name)
  const online = guest.status === 'connected'
  const hostName = guest.participants.find((p) => p.isHost)?.name
  const title = hostName ? `${hostName}'s session` : 'Chat session'
  const pipChat = useMemo(
    () => ({ title, online, messages: guest.messages, me: guest.me }),
    [title, online, guest.messages, guest.me],
  )
  const pip = useAutoPip(pipChat)

  return (
    <>
      <RoomLayout
        title={title}
        statusLabel={STATUS_LABEL[guest.status]}
        online={online}
        pipEnabled={pip.enabled}
        onPipToggle={pip.toggle}
        headerExtra={
          <button className="btn ghost" onClick={onLeave}>
            Change name
          </button>
        }
        banner={
          <>
            {guest.status === 'offline' && (
              <div className="banner warn">
                The host isn't reachable right now. Everything lives on their machine, so it comes back when they do.
              </div>
            )}
            {guest.notice && (
              <div className="banner error" onClick={guest.dismissNotice}>
                {guest.notice} <span className="hint">(click to dismiss)</span>
              </div>
            )}
          </>
        }
        chat={
          <ChatPanel
            messages={guest.messages}
            me={guest.me}
            onSend={guest.sendMessage}
            disabled={!online}
            placeholder={online ? undefined : 'Waiting for the host…'}
          />
        }
        sidebar={
          <>
            {pip.enabled && <FloatPanel slot={pip.previewSlot} />}
            <ParticipantsPanel participants={guest.participants} me={guest.me} />
            <AssetsPanel
              isHost={false}
              assets={guest.assets}
              disabled={!online}
              downloading={guest.downloading}
              onDownload={guest.requestFile}
            />
          </>
        }
      />
      {pip.container && (
        <PipChat container={pip.container} {...pipChat} onSend={guest.sendMessage} />
      )}
    </>
  )
}
