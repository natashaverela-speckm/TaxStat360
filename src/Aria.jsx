import { useState, useRef, useEffect } from 'react'

const ARIA_URL = 'https://lwotbjnqomcuf2rejtaeituze40zvtgy.lambda-url.us-east-1.on.aws/'
const N = '#0D1B3E'

const WELCOME = `Hi, I'm Aria — your TaxStat360 AI tax strategist.\n\nI'm here to help you manage your tax liability in real time, uncover deductions, reduce what you owe, and build long-term wealth through smart tax planning.\n\nHere are a few things you can ask me:\n• "What's my estimated quarterly payment?"\n• "Am I paying myself a reasonable S-Corp salary?"\n• "What deductions am I missing?"\n• "How does my K-1 income affect my 1040?"\n\nWhat can I help you with today?`

export default function Aria() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [welcomed, setWelcomed] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open && !welcomed) {
      setTimeout(() => { setMsgs([{ role: 'assistant', text: WELCOME }]); setWelcomed(true) }, 300)
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 400)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, msgs])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMsgs(m => [...m, { role: 'user', text: userMsg }])
    setLoading(true)
    try {
      const r = await fetch(ARIA_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userMsg }) })
      const d = await r.json()
      setMsgs(m => [...m, { role: 'assistant', text: d.response || d.message || 'Sorry, I had trouble responding.' }])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Connection error. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <>
      {open && (
        <div style={{ position: 'fixed', bottom: 96, right: 20, width: 360, maxHeight: 500, background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(13,27,62,0.18)', display: 'flex', flexDirection: 'column', zIndex: 9998, overflow: 'hidden', border: '1px solid #E2E8F0', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ background: N, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 30 30" fill="none">
              <path d="M15 2L16.2 10L24 12L16.2 14L15 22L13.8 14L6 12L13.8 10Z" fill="#F5C842"/>
              <path d="M24 1L24.7 4.3L28 5L24.7 5.7L24 9L23.3 5.7L20 5L23.3 4.3Z" fill="#F5C842" opacity="0.85"/>
              <path d="M5 18L5.5 20.5L8 21L5.5 21.5L5 24L4.5 21.5L2 21L4.5 20.5Z" fill="#F5C842" opacity="0.7"/>
            </svg>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Aria</div>
            <div style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>TaxStat360 AI</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ background: m.role === 'user' ? N : '#F8FAFC', color: m.role === 'user' ? '#fff' : '#0D1B3E', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '10px 14px', fontSize: 13, maxWidth: '85%', whiteSpace: 'pre-wrap', lineHeight: 1.5, border: m.role === 'user' ? 'none' : '1px solid #E2E8F0' }}>{m.text}</div>
              </div>
            ))}
            {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '4px 16px 16px 16px', padding: '10px 14px', fontSize: 13, color: '#94a3b8' }}>Aria is thinking...</div></div>}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid #e8edf5', display: 'flex', gap: 8, background: '#fff' }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask Aria anything about your taxes..." style={{ flex: 1, border: '1.5px solid #d1d5db', borderRadius: 22, padding: '9px 16px', fontSize: 13, outline: 'none', background: '#f8fafc' }} />
            <button onClick={send} disabled={loading} style={{ background: N, border: 'none', borderRadius: '50%', width: 38, height: 38, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, opacity: loading ? 0.6 : 1 }}>→</button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} style={{ position: 'fixed', bottom: 28, right: 28, width: 56, height: 56, borderRadius: '50%', background: N, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(13,27,62,0.35)', zIndex: 9999 }}>
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
          <path d="M15 2L16.2 10L24 12L16.2 14L15 22L13.8 14L6 12L13.8 10Z" fill="#F5C842"/>
          <path d="M24 1L24.7 4.3L28 5L24.7 5.7L24 9L23.3 5.7L20 5L23.3 4.3Z" fill="#F5C842" opacity="0.85"/>
          <path d="M5 18L5.5 20.5L8 21L5.5 21.5L5 24L4.5 21.5L2 21L4.5 20.5Z" fill="#F5C842" opacity="0.7"/>
        </svg>
      </button>
    </>
  )
}
