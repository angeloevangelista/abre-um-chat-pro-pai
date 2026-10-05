import { useRef, useState, type FormEvent } from 'react'
import type { Asset } from '../types'
import { formatBytes, normalizeUrl } from '../lib/utils'

interface Props {
  assets: Asset[]
  isHost: boolean
  disabled?: boolean
  downloading?: Set<string>
  onDownload: (id: string) => void
  onAddLink?: (title: string, url: string) => void
  onAddFile?: (file: File) => Promise<void>
  onRemove?: (id: string) => void
  maxFileBytes?: number
}

export function AssetsPanel(props: Props) {
  const { assets, isHost, disabled, downloading, onDownload, onRemove } = props
  const sorted = [...assets].sort((a, b) => b.ts - a.ts)

  return (
    <section className="panel">
      <h2>Shared stuff</h2>
      {isHost && <HostAssetForms {...props} />}
      {sorted.length === 0 ? (
        <p className="empty">{isHost ? 'Share a link or file with everyone.' : 'Nothing shared yet.'}</p>
      ) : (
        <ul className="assets">
          {sorted.map((a) => (
            <li key={a.id} className="asset">
              <span className="asset-icon" aria-hidden>
                {a.kind === 'link' ? '🔗' : '📄'}
              </span>
              <div className="asset-body">
                {a.kind === 'link' ? (
                  <>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="asset-title">
                      {a.title}
                    </a>
                    <span className="asset-sub">{new URL(a.url).host}</span>
                  </>
                ) : (
                  <>
                    <span className="asset-title">{a.title}</span>
                    <span className="asset-sub">{formatBytes(a.size)}</span>
                  </>
                )}
              </div>
              {a.kind === 'file' && (
                <button className="btn small" disabled={disabled || downloading?.has(a.id)} onClick={() => onDownload(a.id)}>
                  {downloading?.has(a.id) ? 'Receiving…' : 'Download'}
                </button>
              )}
              {isHost && onRemove && (
                <button className="btn small ghost" title="Stop sharing" onClick={() => onRemove(a.id)}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function HostAssetForms({ onAddLink, onAddFile, maxFileBytes }: Props) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const submitLink = (e: FormEvent) => {
    e.preventDefault()
    const normalized = normalizeUrl(url)
    if (!normalized) return setError('Enter a valid http(s) link.')
    onAddLink?.(title, normalized)
    setTitle('')
    setUrl('')
    setError(null)
  }

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !onAddFile) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        if (maxFileBytes && file.size > maxFileBytes) {
          setError(`${file.name} is larger than ${formatBytes(maxFileBytes)}.`)
          continue
        }
        await onAddFile(file)
      }
    } catch (err) {
      setError(`Could not store the file: ${(err as Error).message}`)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="asset-forms">
      <form className="link-form" onSubmit={submitLink}>
        <input placeholder="Link title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="row">
          <input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn" type="submit" disabled={!url.trim()}>
            Share link
          </button>
        </div>
      </form>
      <label className={`dropzone ${uploading ? 'busy' : ''}`}>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
        {uploading ? 'Saving to this machine…' : '＋ Share files (stored on this machine)'}
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
