import { useState } from 'react'

/**
 * Generic dismissible notice. Persists dismissal state per-session via
 * sessionStorage so the notice reappears in a new tab/session but stays
 * hidden once the user dismisses it within a session.
 *
 * Props:
 *   storageKey: string  unique sessionStorage key (e.g. 'tx360.foo.dismissed')
 *   children:   ReactNode  notice content
 */
export default function DismissibleNotice({ storageKey, children }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined' || !storageKey) return false
    try {
      return window.sessionStorage.getItem(storageKey) === '1'
    } catch (e) {
      // sessionStorage unavailable (private mode, etc.) -- show notice
      return false
    }
  })

  function dismiss() {
    setDismissed(true)
    if (storageKey && typeof window !== 'undefined') {
      try { window.sessionStorage.setItem(storageKey, '1') } catch (e) { /* noop */ }
    }
  }

  if (dismissed) return null

  return (
    <div
      role="note"
      style={{
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
        color: '#0D1B3E',
      }}
    >
      <div style={{ flex: 1 }}>{children}</div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notice"
        style={{
          flex: '0 0 auto',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          color: '#0D1B3E',
          padding: 4,
        }}
      >
        ×
      </button>
    </div>
  )
}
