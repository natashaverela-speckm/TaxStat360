// src/components/ErrorBoundary.jsx
// React Error Boundary — audit finding UX-M01.
// Wraps all protected routes in App.jsx via RequireAuth so that an uncaught
// exception (e.g. calcTaxReturn throws, NaN propagation, malformed entity data)
// shows a user-friendly recovery screen instead of a blank white page.
//
// Class component required — React does not support error boundaries in
// function components (getDerivedStateFromError / componentDidCatch are
// class-only lifecycle methods as of React 18).
//
// App.jsx wraps RequireAuth children with this component. Usage:
//   <ErrorBoundary>
//     <TaxReturn />
//   </ErrorBoundary>

import React from 'react'

const N  = '#0D1B3E'
const SL = '#475569'
const B  = '#2563EB'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[TaxStat360 ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh',
        background: '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 24,
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          padding: '40px 36px',
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: N, margin: '0 0 10px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, color: SL, lineHeight: 1.7, margin: '0 0 8px' }}>
            An unexpected error occurred in TaxStat360.
          </p>
          <p style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#16a34a',
            margin: '0 0 24px',
            background: '#f0fdf4',
            borderRadius: 8,
            padding: '10px 14px',
            border: '1px solid #86efac',
          }}>
            ✓ Your data is safe — all saved records are stored locally and are not affected.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '10px 22px',
                background: B,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard' }}
              style={{
                padding: '10px 22px',
                background: '#fff',
                color: N,
                border: '1.5px solid #E2E8F0',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Go to Dashboard
            </button>
          </div>
          {this.state.error && (
            <details style={{ marginTop: 20, textAlign: 'left' }}>
              <summary style={{ fontSize: 12, color: '#94A3B8', cursor: 'pointer' }}>
                Error details (for support)
              </summary>
              <pre style={{
                marginTop: 8, fontSize: 11, color: '#64748B',
                background: '#F8FAFC', borderRadius: 6, padding: 10,
                overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}
