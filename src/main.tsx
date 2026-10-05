import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode is intentionally omitted: it double-mounts effects, which makes the
// host briefly claim its fixed PeerJS id twice and trip "unavailable-id".
createRoot(document.getElementById('root')!).render(<App />)
