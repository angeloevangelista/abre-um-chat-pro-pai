import { useMemo, useState } from 'react'
import { MAX_FILE_BYTES, useHost, type HostStatus } from '../hooks/useHost'
import { useAutoPip } from '../hooks/useAutoPip'
import { hostStorage } from '../lib/storage'
import { AssetsPanel } from './AssetsPanel'
import { FloatPanel } from './FloatPanel'
import { ChatPanel } from './ChatPanel'
import { ParticipantsPanel } from './ParticipantsPanel'
import { PipChat } from './PipChat'
import { RoomLayout } from './RoomLayout'

const STATUS_LABEL: Record<HostStatus, string> = {
  starting: 'Opening session…',
  online: 'Session open',
  reconnecting: 'Reconnecting…',
  error: 'Session error',
}

function ShareBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async (input: HTMLInputElement | null) => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // Clipboard API needs a secure context; fall back to selecting the text.
      input?.select()
      document.execCommand('copy')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <section className="panel">
      <h2>Invite people</h2>
      <div className="row">
        <input readOnly value={link} onFocus={(e) => e.target.select()} id="share-link" />
        <button className="btn primary" onClick={() => void copy(document.querySelector('#share-link'))}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="hint">Everything stays on this machine. Guests can only reach it while this tab is open.</p>
    </section>
  )
}

export function HostRoom({ hostName }: { hostName: string }) {
  const host = useHost(hostName)
  const online = host.status === 'online'
  const pipChat = useMemo(
    () => ({ title: `${hostName}'s chat`, online: true, messages: host.messages, me: host.me }),
    [hostName, host.messages, host.me],
  )
  const pip = useAutoPip(pipChat)
  const link = `${location.origin}${location.pathname}?join=${encodeURIComponent(host.peerId)}`
  const guestCount = host.participants.length - 1

  const endSession = async () => {
    if (!confirm('End the session and permanently delete the chat and all shared files from this machine?')) return
    await hostStorage.wipe()
    location.replace(location.pathname)
  }

  return (
    <>
      <RoomLayout
        title={`${hostName}'s session`}
        statusLabel={`${STATUS_LABEL[host.status]}${online ? ` · ${guestCount} guest${guestCount === 1 ? '' : 's'}` : ''}`}
        online={online}
        pipEnabled={pip.enabled}
        onPipToggle={pip.toggle}
        headerExtra={
          <>
            <button className="btn ghost" onClick={() => confirm('Clear the chat history for everyone?') && host.clearChat()}>
              Clear chat
            </button>
            <button className="btn danger" onClick={() => void endSession()}>
              End session
            </button>
          </>
        }
        banner={host.error && <div className="banner error">{host.error}</div>}
        chat={<ChatPanel messages={host.messages} me={host.me} onSend={host.sendMessage} />}
        sidebar={
          <>
            {pip.enabled && <FloatPanel slot={pip.previewSlot} />}
            <ShareBox link={link} />
            <ParticipantsPanel participants={host.participants} me={host.me} />
            <AssetsPanel
              isHost
              assets={host.assets}
              onDownload={(id) => void host.downloadFile(id)}
              onAddLink={host.addLink}
              onAddFile={host.addFile}
              onRemove={host.removeAsset}
              maxFileBytes={MAX_FILE_BYTES}
            />
          </>
        }
      />
      {pip.container && (
        <PipChat container={pip.container} {...pipChat} onSend={host.sendMessage} />
      )}
    </>
  )
}
