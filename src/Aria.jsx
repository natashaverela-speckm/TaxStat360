import { useState, useRef, useEffect } from 'react'

const ARIA_URL = 'https://lwotbjnqomcuf2rejtaeituze40zvtgy.lambda-url.us-east-1.on.aws/'
const N = '#0D1B3E'

const GlowStar = ({ open }) => (
  <div style={{ position: 'relative', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <style>{`
      @keyframes pulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }
      @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      .aria-glow { animation: pulse 2s ease-in-out infinite; }
      .aria-ring { animation: pulse 2.5s ease-in-out infinite; animation-delay: 0.5s; }
    `}</style>
    <div className="aria-ring" style={{ position:'absolute', width:72, height:72, borderRadius:'50%', background:'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)', pointerEvents:'none' }} />
    <div className="aria-glow" style={{ position:'absolute', width:56, height:56, borderRadius:'50%', background:'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)', pointerEvents:'none' }} />
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ filter: `drop-shadow(0 0 10px rgba(59,130,246,0.9)) drop-shadow(0 0 20px rgba(13,27,62,0.7))`, transform: open ? 'scale(1.12)' : 'scale(1)', transition: 'transform 0.2s' }}>
      <path d="M28 4L32 22L50 28L32 34L28 52L24 34L6 28L24 22Z" fill={N} />
      <path d="M28 4L32 22L50 28L32 34L28 52L24 34L6 28L24 22Z" fill="url(#sg)" opacity="0.6"/>
      <circle cx="28" cy="28" r="5" fill="white" opacity="0.9"/>
      <circle cx="28" cy="28" r="2.5" fill="white"/>
      <line x1="28" y1="4" x2="28" y2="10" stroke="white" strokeWidth="1.5" opacity="0.7"/>
      <line x1="28" y1="46" x2="28" y2="52" stroke="white" strokeWidth="1.5" opacity="0.7"/>
      <line x1="4" y1="28" x2="10" y2="28" stroke="white" strokeWidth="1.5" opacity="0.7"/>
      <line x1="46" y1="28" x2="52" y2="28" stroke="white" strokeWidth="1.5" opacity="0.7"/>
      <circle cx="13" cy="13" r="1.5" fill="white" opacity="0.6"/>
      <circle cx="43" cy="13" r="1.5" fill="white" opacity="0.6"/>
      <circle cx="13" cy="43" r="1.5" fill="white" opacity="0.6"/>
      <circle cx="43" cy="43" r="1.5" fill="white" opacity="0.6"/>
      <defs>
        <radialGradient id="sg" cx="50%" cy="30%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="0.8"/>
          <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
        </radialGradient>
      </defs>
    </svg>
  </div>
)

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
        setMsgs([{ role: 'assistant', text: "✦ Hi, I'm Aria — your TaxStat360 AI tax strategist.\n\nI'm here to help you manage your tax liability in real time, uncover deductions, reduce what you owe, and build long-term wealth through smart tax planning.\n\nHere are a few things you can ask me:\n• What's my estimated quarterly payment?\n• Am I paying myself a reasonable S-Corp salary?\n• What deductions am I missing?\n• How does my K-1 income affect my 1040?\n\nWhat can I help you with today?" }])
        setWelcomed(true)
      }, 400)
    }
  }, [open])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

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
      <button onClick={()=>setOpen(o=>!o)} style={{position:'fixed',bottom:28,right:28,width:56,height:56,borderRadius:'50%',background:'#0D1B3E',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 20px rgba(13,27,62,0.35)',zIndex:9999}}>
        <svg width="26" height="26" viewBox="0 0 56 56" fill="none">
          <path d="M28 4L32 22L50 28L32 34L28 52L24 34L6 28L24 22Z" fill="#F5C842"/>
          <circle cx="28" cy="28" r="4" fill="#0D1B3E"/>
        </svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', bottom: 80, right: 0, width: 350, height: 500, background: '#fff', borderRadius: 18, boxShadow: '0 12px 50px rgba(13,27,62,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1.5px solid ${N}` }}>
          <div style={{ background: N, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 56 56" fill="none"><path d="M28 4L32 22L50 28L32 34L28 52L24 34L6 28L24 22Z" fill="white"/><circle cx="28" cy="28" r="4" fill={N}/></svg>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Aria</div>
                <div style={{ color: '#93b4d4', fontSize: 11 }}>TaxStat360 AI Strategist</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#93b4d4', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10, background: '#f5f7fb' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-start', gap: 6 }}>
                {m.role === 'assistant' && <div style={{ marginTop: 8, flexShrink: 0 }}><svg width="14" height="14" viewBox="0 0 56 56"><path d="M28 4L32 22L50 28L32 34L28 52L24 34L6 28L24 22Z" fill={N}/></svg></div>}
                <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px', background: m.role === 'user' ? N : '#fff', color: m.role === 'user' ? '#fff' : '#1e293b', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', boxShadow: m.role === 'assistant' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', border: m.role === 'assistant' ? '1px solid #e2e8f0' : 'none' }}>{m.text}</div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 56 56"><path d="M28 4L32 22L50 28L32 34L28 52L24 34L6 28L24 22Z" fill={N}/></svg>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px 16px 16px 16px', padding: '10px 14px', fontSize: 13, color: '#94a3b8' }}>Aria is thinking...</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid #e8edf5', display: 'flex', gap: 8, background: '#fff' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask Aria anything about your taxes..." style={{ flex: 1, border: '1.5px solid #d1d5db', borderRadius: 22, padding: '9px 16px', fontSize: 13, outline: 'none', background: '#f8fafc' }} />
            <button onClick={send} disabled={loading} style={{ background: N, border: 'none', borderRadius: '50%', width: 38, height: 38, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>→</button>
          </div>
        </div>
      )}
      <button onClick={()=>setOpen(o=>!o)} style={{position:'fixed',bottom:28,right:28,width:56,height:56,borderRadius:'50%',background:'#0D1B3E',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 20px rgba(13,27,62,0.35)',zIndex:9999}}>
        <svg width='26' height='26' viewBox='0 0 56 56' fill='none'>
          <path d='M28 4L32 22L50 28L32 34L28 52L24 34L6 28L24 22Z' fill='#F5C842'/>
          <circle cx='28' cy='28' r='4' fill='#0D1B3E'/>
        </svg>
      </button>
    </>
  )
}
