import { useState, useRef, useEffect } from 'react'

const ARIA_URL = 'https://lwotbjnqomcuf2rejtaeituze40zvtgy.lambda-url.us-east-1.on.aws/'
const N = '#0D1B3E'
const B = '#2563EB'

const WELCOME = `Hi, I'm Aria — your TaxStat360 AI tax strategist.

I'm here to help you manage your tax liability in real time, uncover deductions, reduce what you owe, and build long-term wealth through smart tax planning.

Here are a few things you can ask me:
• "What's my estimated quarterly payment?"
• "Am I paying myself a reasonable S-Corp salary?"
• "What deductions am I missing?"
• "How does my K-1 income affect my 1040?"

What can I help you with today?`

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
      setTimeout(() => {
        setMsgs([{ role: 'assistant', text: WELCOME }])
        setWelcomed(true)
      }, 300)
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 350)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    const newMsgs = [...msgs, { role: 'user', text: userMsg }]
    setMsgs(newMsgs)
    setLoading(true)
    try {
      const res = await fetch(ARIA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.text })) })
      })
      const data = await res.json()
      setMsgs(prev => [...prev, { role: 'assistant', text: data.reply || 'Sorry, try again.' }])
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', text: 'Connection error. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <>
      {open && (
        <div style={{
          position: 'fixed', bottom: 56, right: 0, left: 0,
          display: 'flex', justifyContent: 'flex-end',
          padding: '0 24px', zIndex: 9998,
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 380, height: 520,
            background: '#fff',
            borderRadius: '16px 16px 0 0',
            boxShadow: '0 -4px 40px rgba(13,27,62,0.18)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            border: '1.5px solid ' + N,
            borderBottom: 'none',
            pointerEvents: 'all',
          }}>
            <div style={{
              background: N, padding: '14px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="20" height="20" viewBox="0 0 56 56" fill="none">
                  <path d="M28 4L32 22L50 28L32 34L28 52L24 34L6 28L24 22Z" fill="white"/>
                  <circle cx="28" cy="28" r="4" fill={N}/>
                </svg>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Aria</div>
                  <div style={{ color: '#93b4d4', fontSize: 11 }}>TaxStat360 AI Tax Strategist</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#93b4d4', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10, background: '#f5f7fb' }}>
              {msgs.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-start', gap: 6 }}>
                  {m.role === 'assistant' && (
                    <div style={{ marginTop: 8, flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 56 56"><path d="M28 4L32 22L50 28L32 34L28 52L24 34L6 28L24 22Z" fill={N}/></svg>
                    </div>
                  )}
                  <div style={{ maxWidth: '82%', padding: '10px 14px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px', background: m.role === 'user' ? N : '#fff', color: m.role === 'user' ? '#fff' : '#1e293b', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', boxShadow: m.role === 'assistant' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', border: m.role === 'assistant' ? '1px solid #e2e8f0' : 'none' }}>{m.text}</div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 56 56"><path d="M28 4L32 22L50 28L32 34L28 52L24 34L6 28L24 22Z" fill={N}/></svg>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px 16px 16px 16px', padding: '10px 14px', fontSize: 13, color: '#94a3b8' }}>Aria is thinking...</div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid #e8edf5', display: 'flex', gap: 8, background: '#fff', flexShrink: 0 }}>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask Aria about your taxes..." style={{ flex: 1, border: '1.5px solid #d1d5db', borderRadius: 22, padding: '9px 16px', fontSize: 13, outline: 'none', background: '#f8fafc', fontFamily: 'Inter, sans-serif' }} />
              <button onClick={send} disabled={loading} style={{ background: N, border: 'none', borderRadius: '50%', width: 38, height: 38, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, opacity: loading ? 0.6 : 1 }}>→</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 56, background: N, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, boxShadow: '0 -2px 20px rgba(13,27,62,0.25)' }}>
        <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 28, padding: '8px 22px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
          <svg width="22" height="22" viewBox="0 0 56 56" fill="none">
            <path d="M38 8L40.5 18L50 20L40.5 22L38 32L35.5 22L26 20L35.5 18Z" fill="#FFD700"/>
            <path d="M20 20L22 28L30 30L22 32L20 40L18 32L10 30L18 28Z" fill="#FFD700" opacity="0.85"/>
            <path d="M34 34L35.5 39L40 40L35.5 41L34 46L32.5 41L28 40L32.5 39Z" fill="#FFD700" opacity="0.7"/>
          </svg>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: '0.01em' }}>{open ? 'Close Aria' : 'Ask Aria'}</span>
          <span style={{ background: B, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>AI</span>
        </button>
        <div style={{ position: 'absolute', right: 24, color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'Inter, sans-serif' }}>TaxStat360 AI Strategist</div>
      </div>
    </>
  )
}
