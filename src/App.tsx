import { useState } from 'react'
import { GuestRoom } from './components/GuestRoom'
import { HostRoom } from './components/HostRoom'
import { NameForm } from './components/NameForm'
import { guestStorage, hostStorage } from './lib/storage'

function HostApp() {
  const [name, setName] = useState(() => hostStorage.getName())
  if (!name) {
    return (
      <NameForm
        heading="Open a chat session"
        subheading="Your browser becomes the host. The chat, links and files stay on this machine and are available while this tab is open."
        action="Open session"
        initialName=""
        onSubmit={(value) => {
          hostStorage.setName(value)
          setName(value)
        }}
      />
    )
  }
  return <HostRoom hostName={name} />
}

function GuestApp({ hostPeerId }: { hostPeerId: string }) {
  const [name, setName] = useState<string | null>(null)
  if (!name) {
    return (
      <NameForm
        heading="Join the chat"
        subheading="Tell everyone who you are."
        action="Join"
        initialName={guestStorage.getName()}
        onSubmit={(value) => {
          guestStorage.setName(value)
          setName(value)
        }}
      />
    )
  }
  return <GuestRoom hostPeerId={hostPeerId} name={name} onLeave={() => setName(null)} />
}

export default function App() {
  const hostPeerId = new URLSearchParams(location.search).get('join')
  return hostPeerId ? <GuestApp hostPeerId={hostPeerId} /> : <HostApp />
}
