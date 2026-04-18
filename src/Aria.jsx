import { useState, useRef, useEffect } from 'react'

const ARIA_URL = 'https://lwotbjnqomcuf2rejtaeituze40zvtgy.lambda-url.us-east-1.on.aws/'
const N = '#0D1B3E'
const NL = '#1a2f5e'

export default function Aria() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [welcomed, setWelcomed] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open && !welcomed) {
      setTimeout(() => {
        setMsgs([{ role: 'assistant', text: "✦ Hi, I'm Aria — your TaxStat360 AI tax strategist. I'm here to help you manage your tax liability in real time, find deductions, and build wealth through smart tax planning. What can I help you with today?" }])
        setWelcomed(true)
      }, 400)
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
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, fontFamily: 'Inter,sans-serif' }}>
      {open && (
        <div style={{ position: 'absolute', bottom: 68, right: 0, width: 340, height: 490, background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(13,27,62,0.22)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${N}` }}>
          <div style={{ background: N, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, color: '#fff' }}>✦</span>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>Aria</div>
                <div style={{ color: '#93b4d4', fontSize: 11 }}>TaxStat360 AI Strategist</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#93b4d4', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10, background: '#f8fafd' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && <span style={{ fontSize: 14, marginRight: 6, marginTop: 6 }}>✦</span>}
                <div style={{ maxWidth: '80%', padding: '9px 13px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.role === 'user' ? N : '#fff', color: m.role === 'user' ? '#fff' : '#1e293b', fontSize: 13, lineHeight: 1.55, border: m.role === 'assistant' ? `1px solid #e2e8f0` : 'none', boxShadow: m.role === 'assistant' ? '0 1px 3px rgba(0,0,0,0.07)' : 'none' }}>{m.text}</div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>✦</span>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px 14px 14px 4px', padding: '9px 13px', fontSize: 13, color: '#64748b' }}>Aria is thinking...</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, background: '#fff' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask Aria anything..." style={{ flex: 1, border: `1px solid #d1d5db`, borderRadius: 20, padding: '8px 14px', fontSize: 13, outline: 'none' }} />
            <button onClick={send} disabled={loading} style={{ background: N, border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>→</button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} style={{ width: 48, height: 48, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: open ? 'drop-shadow(0 0 8px rgba(59,130,246,0.8))' : 'drop-shadow(0 2px 8px rgba(13,27,62,0.5))', transition: 'all 0.2s' }}>
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <path d="M22 2L25.5 17.5L40 22L25.5 26.5L22 42L18.5 26.5L3 22L18.5 17.5Z" fill={N} stroke="#fff" strokeWidth="1"/>
        </svg>
      </button>
    </div>
  )
}
