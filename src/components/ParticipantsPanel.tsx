import type { Participant } from '../types'

export function ParticipantsPanel({ participants, me }: { participants: Participant[]; me: Participant | null }) {
  return (
    <section className="panel">
      <h2>
        People <span className="count">{participants.length}</span>
      </h2>
      <ul className="people">
        {participants.map((p) => (
          <li key={p.id}>
            <span className="avatar" aria-hidden>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              {p.name}
              {p.id === me?.id && ' (you)'}
            </span>
            {p.isHost && <span className="badge">host</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
