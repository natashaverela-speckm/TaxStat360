import { useState } from 'react'
import { NAVY as N } from '../lib/theme.js'

/**
 * Generic dismissible notice. Persists dismissal state in either sessionStorage
 * (default — reappears in a new session) or localStorage (stays dismissed
 * across sessions on the same device).
 *
 * Props:
 *   storageKey:       string    unique storage key (e.g. 'tx360.foo.dismissed')
 *   persistence:      'session' (default) or 'local'
 *   containerStyle:   object    optional inline-style overrides for the wrapper
 *   closeButtonStyle: object    optional inline-style overrides for the close button
 *   children:         ReactNode notice content
 */
export default function DismissibleNotice({
  storageKey,
  persistence = 'session',
  containerStyle,
  closeButtonStyle,
  children,
}) {
  const getStore = () => {
    if (typeof window === 'undefined') return null
    try {
      return persistence === 'local' ? window.localStorage : window.sessionStorage
    } catch (e) {
      // M5: storage unavailable → no persistence; the notice simply shows each visit.
      return null
    }
  }

  const [dismissed, setDismissed] = useState(() => {
    if (!storageKey) return false
    const store = getStore()
    if (!store) return false
    try {
      return store.getItem(storageKey) === '1'
    } catch (e) {
      // storage unavailable (private mode, etc.) -- show notice
      return false
    }
  })

  function dismiss() {
    setDismissed(true)
    if (!storageKey) return
    const store = getStore()
    if (!store) return
    try { store.setItem(storageKey, '1') } catch (e) { /* noop */ }
  }

  if (dismissed) return null

  const defaultContainerStyle = {
    background: '#FFF8E1',
    border: '1px solid #F0C36D',
    borderLeft: '4px solid #F0C36D',
    borderRadius: 6,
    padding: '12px 14px',
    margin: '12px 0',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    fontSize: 14,
    lineHeight: 1.5,
    color: N,
  }

  const defaultCloseButtonStyle = {
    flex: '0 0 auto',
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    color: N,
    padding: 4,
  }

  return (
    <div
      role="note"
      style={{ ...defaultContainerStyle, ...(containerStyle || {}) }}
    >
      <div style={{ flex: 1 }}>{children}</div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notice"
        style={{ ...defaultCloseButtonStyle, ...(closeButtonStyle || {}) }}
      >
        ×
      </button>
    </div>
  )
}
