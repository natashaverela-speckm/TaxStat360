import { useState, useRef, useEffect } from 'react'
const N='#0D1B3E', B='#2563EB', SL='#475569'
const SUPPORT_EMAIL = 'support@taxstat360.com'

const SUGGESTIONS = [
  'How do I read my compliance score?',
  'What is the What-If Simulator?',
  'How do I run an AI Analysis?',
  'What does my risk alert mean?',
  'How do I export to my CPA?',
  'How do I connect QuickBooks?',
]

const KNOWLEDGE = [
  { q: ['compliance score','compliance'], a: 'Your Compliance Score (0–100%) measures how well your financials align with IRS expectations for your entity type. Above 85% is strong. Below 70% means you have flagged items to address. Click "AI Analysis" to see exactly what\'s affecting your score.' },
  { q: ['what-if','simulator','scenario'], a: 'The What-If Simulator lets you model tax changes before making them — like adjusting your officer salary, changing your depreciation method, or restructuring your entity. Go to AI Analysis → "What-If Simulator" tab to run a scenario.' },
  { q: ['risk alert','alert','flag'], a: 'A Risk Alert means TaxStat360\'s AI detected something that could create IRS scrutiny — for example, officer salary below the IRS threshold, or depreciation inconsistencies. Go to AI Analysis and click "Review Alerts" to see each issue and what to do.' },
  { q: ['cpa','export','accountant'], a: 'Use the "Generate CPA Export Pack" button on the AI Analysis screen. It compiles your compliance summary, risk alerts, and tax strategies into a clean report your accountant can use immediately.' },
  { q: ['quickbooks','xero','wave','freshbooks','connect','accounting'], a: 'Go to your Dashboard → "Connect Accounting" quick action. You can link QuickBooks, Xero, Wave, or FreshBooks. Once connected, your financials auto-populate your tax calculations.' },
  { q: ['audit','defense','narrative'], a: 'The Audit Defense Narrative is an AI-generated document that explains your tax positions in IRS-friendly language. Find it in AI Analysis → "Generate Audit Defense Narrative." It\'s ready to share with your attorney or CPA if you\'re ever contacted by the IRS.' },
  { q: ['calculate','k-1','schedule','tax calculation'], a: 'Go to "Calculate Tax" in the top nav. Click "+ Start New Calculation," enter your gross revenue, business expenses, officer salary, and ownership %. TaxStat360 auto-calculates your K-1 and estimated tax liability.' },
  { q: ['pricing','plan','upgrade','basic','professional','advanced'], a: 'TaxStat360 has three plans: Basic ($49/mo, 10 features), Professional ($99/mo, 20 features), and Advanced ($199/mo, all 32 features). All plans include a 7-day free trial. Contact support@taxstat360.com to change your plan.' },
  { q: ['deadline','estimated tax','quarterly','payroll'], a: 'Your upcoming tax deadlines are shown on your Dashboard under "Upcoming Tax Deadlines." These auto-calculate from today\'s date and include Q1/Q2 estimated taxes, S-Corp payroll deadlines, and Form 1120-S extension dates.' },
  { q: ['cancel','subscription','refund'], a: 'To cancel your subscription or request a refund, email support@taxstat360.com. We offer a full refund within the 7-day trial period.' },
  { q: ['password','login','sign in','access'], a: 'If you\'re having trouble signing in, try the "Sign In" button on taxstat360.com and use your registered email. For password resets, email support@taxstat360.com and we\'ll get you back in within a few hours.' },
  { q: ['entity','s-corp','llc','partnership','sole prop'], a: 'TaxStat360 is built for S-Corporations, Multi-Member LLCs, Partnerships, and Sole Proprietors. Your entity type determines which IRS schedules get mapped and which features apply to you. You can update your entity type in Profile & Settings.' },
]

function getAnswer(input) {
  const q = input.toLowerCase()
  for (const item of KNOWLEDGE) {
    if (item.q.some(k => q.includes(k))) return item.a
  }
  return null
}

export default function TaxPert() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('chat') // 'chat' | 'support'
  const [msgs, setMsgs] = useState([
    { from: 'bot', text: "Hi! I'm Tax'Pert, your AI guide to TaxStat360. Ask me anything about your dashboard, features, or how to use the platform — or pick a topic below." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async (text) => {
    const q = text || input
    if (!q.trim()) return
    setInput('')
    setMsgs(m => [...m, { from: 'user', text: q }])
    setLoading(true)

    // First try local knowledge base
    const local = getAnswer(q)
    if (local) {
      setTimeout(() => {
        setMsgs(m => [...m, { from: 'bot', text: local }])
        setLoading(false)
      }, 600)
      return
    }

    // Fall back to Claude API
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: `You are Tax'Pert, a helpful AI assistant for TaxStat360 — an AI-powered tax intelligence platform built by a former IRS Revenue Agent. You help users navigate the platform. TaxStat360 features: Dashboard (compliance score, risk alerts, deadlines, activity), Calculate Tax (K-1, Schedule E/C, estimated taxes), AI Analysis (risk alerts, what-if simulator, CPA export, audit defense narrative), and account settings. Plans: Basic $49/mo, Professional $99/mo, Advanced $199/mo. Support email: support@taxstat360.com. Keep answers concise, practical, and friendly. If you can't answer, direct them to support@taxstat360.com.`,
          messages: [{ role: 'user', content: q }]
        })
      })
      const d = await r.json()
      const ans = d.content?.[0]?.text || "I'm not sure about that — please email support@taxstat360.com and we'll help you right away!"
      setMsgs(m => [...m, { from: 'bot', text: ans }])
    } catch {
      setMsgs(m => [...m, { from: 'bot', text: "I'm having trouble connecting right now. Please email support@taxstat360.com and we'll help you shortly!" }])
    }
    setLoading(false)
  }

  return (
    <>
      {/* Floating button cluster */}
      <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:10 }}>

        {/* Support email pill */}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{
          display:'flex', alignItems:'center', gap:8, background:'#fff',
          border:'1px solid #E2E8F0', borderRadius:999, padding:'8px 16px',
          boxShadow:'0 2px 12px rgba(0,0,0,0.10)', textDecoration:'none',
          fontSize:13, fontWeight:600, color:N, whiteSpace:'nowrap',
          transition:'box-shadow 0.15s'
        }}>
          <span style={{fontSize:16}}>✉️</span> support@taxstat360.com
        </a>

        {/* Chat window */}
        {open && (
          <div style={{
            width:360, height:520, background:'#fff', borderRadius:18,
            boxShadow:'0 8px 48px rgba(13,27,62,0.18)', border:'1px solid #E2E8F0',
            display:'flex', flexDirection:'column', overflow:'hidden'
          }}>
            {/* Header */}
            <div style={{ background:N, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:B, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🤖</div>
                <div>
                  <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>Tax'Pert</div>
                  <div style={{ color:'#93C5FD', fontSize:11 }}>AI Platform Guide · Always Online</div>
                </div>
              </div>
              <button onClick={()=>setOpen(false)} style={{ background:'transparent', border:'none', color:'#94A3B8', fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', borderBottom:'1px solid #E2E8F0' }}>
              {['chat','support'].map(t => (
                <button key={t} onClick={()=>setTab(t)} style={{
                  flex:1, padding:'10px', border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
                  background: tab===t ? '#fff' : '#F8FAFC',
                  color: tab===t ? B : SL,
                  borderBottom: tab===t ? `2px solid ${B}` : '2px solid transparent'
                }}>{t==='chat' ? "💬 Ask Tax'Pert" : '✉️ Email Support'}</button>
              ))}
            </div>

            {/* Chat tab */}
            {tab==='chat' && <>
              <div style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column', gap:10 }}>
                {msgs.map((m,i) => (
                  <div key={i} style={{ display:'flex', justifyContent: m.from==='user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth:'82%', padding:'10px 13px', borderRadius: m.from==='user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: m.from==='user' ? B : '#F1F5F9',
                      color: m.from==='user' ? '#fff' : N,
                      fontSize:13, lineHeight:1.55
                    }}>{m.text}</div>
                  </div>
                ))}
                {loading && (
                  <div style={{ display:'flex', justifyContent:'flex-start' }}>
                    <div style={{ background:'#F1F5F9', borderRadius:'14px 14px 14px 4px', padding:'10px 16px' }}>
                      <span style={{ display:'inline-flex', gap:4 }}>
                        {[0,1,2].map(i => <span key={i} style={{ width:6, height:6, background:'#94A3B8', borderRadius:'50%', display:'inline-block', animation:`bounce 0.9s ${i*0.15}s infinite` }}/>)}
                      </span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>

              {/* Suggestions */}
              {msgs.length <= 1 && (
                <div style={{ padding:'0 14px 10px', display:'flex', flexWrap:'wrap', gap:6 }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={()=>send(s)} style={{
                      background:'#EFF6FF', color:B, border:'1px solid #BFDBFE',
                      borderRadius:20, padding:'5px 12px', fontSize:11, fontWeight:600, cursor:'pointer'
                    }}>{s}</button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div style={{ padding:'12px 14px', borderTop:'1px solid #E2E8F0', display:'flex', gap:8 }}>
                <input
                  value={input}
                  onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&send()}
                  placeholder="Ask me anything..."
                  style={{ flex:1, padding:'9px 14px', borderRadius:10, border:'1px solid #E2E8F0', fontSize:13, outline:'none', color:N }}
                />
                <button onClick={()=>send()} style={{ background:B, color:'#fff', border:'none', borderRadius:10, padding:'9px 14px', fontSize:13, fontWeight:700, cursor:'pointer' }}>→</button>
              </div>
            </>}

            {/* Support tab */}
            {tab==='support' && (
              <div style={{ flex:1, padding:24, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', gap:16 }}>
                <div style={{ fontSize:48 }}>✉️</div>
                <h3 style={{ color:N, fontWeight:800, fontSize:18, margin:0 }}>Email Support</h3>
                <p style={{ color:SL, fontSize:14, lineHeight:1.7, margin:0 }}>
                  Our support team responds within a few hours. Include your account email and a description of your issue.
                </p>
                <a href={`mailto:${SUPPORT_EMAIL}?subject=TaxStat360 Support Request`} style={{
                  display:'block', width:'100%', padding:'13px', background:B, color:'#fff',
                  borderRadius:10, fontWeight:700, fontSize:15, textDecoration:'none', textAlign:'center'
                }}>Email support@taxstat360.com</a>
                <div style={{ background:'#F8FAFC', borderRadius:12, padding:'14px 16px', width:'100%', textAlign:'left' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:SL, marginBottom:10, letterSpacing:'0.5px' }}>BEFORE YOU EMAIL, TRY:</div>
                  {["Ask Tax'Pert in the Chat tab","Check your Dashboard for status updates","Try the AI Analysis screen for issue details"].map(t=>(
                    <div key={t} style={{ display:'flex', gap:8, marginBottom:6, fontSize:13, color:N }}>
                      <span style={{ color:'#10B981', fontWeight:700 }}>✓</span> {t}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main chat button */}
        <button onClick={()=>setOpen(o=>!o)} style={{
          width:58, height:58, borderRadius:'50%', background: open ? '#374151' : B,
          border:'none', cursor:'pointer', boxShadow:'0 4px 20px rgba(37,99,235,0.4)',
          fontSize:24, display:'flex', alignItems:'center', justifyContent:'center',
          transition:'background 0.2s, transform 0.15s', transform: open ? 'rotate(45deg)' : 'none'
        }}>
          {open ? '✕' : '🤖'}
        </button>
      </div>

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }`}</style>
    </>
  )
}
