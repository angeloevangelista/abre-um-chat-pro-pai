import { useState, type FormEvent } from 'react'
import { cleanName } from '../lib/utils'

interface Props {
  heading: string
  subheading: string
  action: string
  initialName: string
  onSubmit: (name: string) => void
}

export function NameForm({ heading, subheading, action, initialName, onSubmit }: Props) {
  const [name, setName] = useState(initialName)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = cleanName(name)
    if (value) onSubmit(value)
  }
  return (
    <div className="landing">
      <form className="card" onSubmit={submit}>
        <div className="logo" aria-hidden>
          💬
        </div>
        <h1>{heading}</h1>
        <p>{subheading}</p>
        <input autoFocus placeholder="Your name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary block" type="submit" disabled={!cleanName(name)}>
          {action}
        </button>
      </form>
    </div>
  )
}
