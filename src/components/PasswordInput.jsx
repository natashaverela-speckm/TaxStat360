import { useState } from 'react'

function EyeToggle({ show }) {
  if (show) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M10.58 10.58a2 2 0 002.84 2.84M9.88 9.88A3 3 0 0112 9c1.66 0 3 1.34 3 3 0 .4-.08.78-.22 1.12M6.1 6.1C4.22 7.56 2.77 9.33 2 12c1.73 4.39 6 7 10 7 1.55 0 3.03-.35 4.35-.97M17.94 17.94A10.94 10.94 0 0012 19c-4 0-8.27-2.61-10-7a11.8 11.8 0 014.24-5.11"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export default function PasswordInput({
  id,
  value,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  placeholder,
  autoComplete,
  hasError = false,
  inputStyle = {},
}) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          width: '100%',
          padding: '9px 40px 9px 12px',
          border: `1px solid ${hasError ? '#DC2626' : '#E2E8F0'}`,
          borderRadius: 7,
          fontSize: 14,
          color: '#0D1B3E',
          boxSizing: 'border-box',
          outline: 'none',
          fontFamily: 'Inter,sans-serif',
          ...inputStyle,
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          color: '#64748B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <EyeToggle show={show} />
      </button>
    </div>
  )
}
