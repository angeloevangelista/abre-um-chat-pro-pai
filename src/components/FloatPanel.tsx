/** Live preview of the floating chat, shown while "Picture it!" is on. */
export function FloatPanel({ slot }: { slot: (el: HTMLElement | null) => void }) {
  return (
    <section className="panel">
      <h2>Picture it! is on</h2>
      <div className="float-preview" ref={slot} />
      <p className="hint">Switch to another tab and the chat floats on top. It goes away when you come back.</p>
    </section>
  )
}
