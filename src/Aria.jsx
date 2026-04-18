import { useState, useRef, useEffect } from 'react'

export default function Aria() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! I\'m Aria, your TaxStat360 AI assistant. Ask me anything about your taxes, deductions, or financial strategy.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': '' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: 'You are Aria, an expert AI tax strategist assistant for TaxStat360, a real-time tax liability management platform. You help business owners understand their tax position, find deductions, reduce liability, and build wealth through smart tax strategy. Be concise, practical, and proactive. Focus on US tax law, IRS compliance, and real-time tax planning strategies.',
          messages: [{ role: 'user', content: userMsg }]
        })
      })
      const data = await res.json()
      const reply = data.content?.[0]?.text || 'Sorry, I could not get a response.'
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Connection error. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, fontFamily: 'Inter, sans-serif' }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 72, right: 0, width: 340, height: 480,
          background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0'
        }}>
          <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>✦</span>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Aria</div>
                <div style={{ color: '#93c5fd', fontSize: 11 }}>TaxStat360 AI Assistant</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%', padding: '9px 13px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? '#3b82f6' : '#f1f5f9',
                  color: m.role === 'user' ? '#fff' : '#1e293b', fontSize: 13, lineHeight: 1.5
                }}>{m.text}</div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: '#f1f5f9', borderRadius: '14px 14px 14px 4px', padding: '9px 13px', fontSize: 13, color: '#64748b' }}>Aria is thinking...</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask Aria anything..."
              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 20, padding: '8px 14px', fontSize: 13, outline: 'none', background: '#f8fafc' }}
            />
            <button onClick={send} disabled={loading} style={{
              background: '#3b82f6', border: 'none', borderRadius: '50%', width: 36, height: 36,
              color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>→</button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} style={{
        width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
        boxShadow: '0 4px 20px rgba(59,130,246,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, color: '#fff', transition: 'transform 0.2s',
        transform: open ? 'rotate(180deg) scale(1.1)' : 'scale(1)'
      }}>✦</button>
    </div>
  )
}
