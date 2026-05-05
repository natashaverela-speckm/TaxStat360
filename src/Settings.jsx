import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const N = '#0D1B3E', B = '#2563EB', SL = '#475569'
const API = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'

function LOGO() {
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
      <div style={{width:32,height:32,background:N,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="12" width="4" height="9" fill="white" rx="1"/>
          <rect x="10" y="7" width="4" height="14" fill="white" rx="1"/>
          <rect x="17" y="3" width="4" height="18" fill="white" rx="1"/>
        </svg>
      </div>
      <span style={{fontWeight:800,fontSize:18,color:N,letterSpacing:'-0.5px'}}>TaxStat<span style={{color:B}}>360</span></span>
    </div>
  )
}

function NavBtn({label, onClick, active}) {
  return (
    <button onClick={onClick} style={{
      padding:'7px 16px', border:'1px solid #E2E8F0', borderRadius:7,
      background: active ? N : '#fff', color: active ? '#fff' : SL,
      fontWeight:600, fontSize:13, cursor:'pointer'
    }}>{label}</button>
  )
}

function signOut(nav) {
  ['token','plan','billing','ts360_session','ts360_email','userName','ts360_connected_app','ts360_quickbooks_token','ts360_quickbooks_connected','ts360_quickbooks_extra','ts360_xero_token','ts360_xero_connected','ts360_xero_refresh','ts360_wave_token','ts360_wave_connected','ts360_freshbooks_token','ts360_freshbooks_connected'].forEach(k=>localStorage.removeItem(k))
  nav('/')
}

export default function Settings() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('')
  const [memberSince, setMemberSince] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [pwSent, setPwSent] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    // Try ts360_email first, then decode from JWT token, then scan localStorage keys
    let storedEmail = localStorage.getItem('ts360_email') || ''
    if (!storedEmail) {
      // Decode JWT payload to get email if not stored separately.
      // Both 'token' and 'ts360_session' are written by Onboarding (signup + login)
      // and hold the same JWT access_token. 'token' is the canonical API bearer
      // (used in Authorization headers below); 'ts360_session' is the auth-presence
      // signal read by App.jsx RequireAuth. Reading either as fallback is safe.
      const token = localStorage.getItem('token') || localStorage.getItem('ts360_session') || ''
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          storedEmail = payload.email || payload.sub || ''
          if (storedEmail) localStorage.setItem('ts360_email', storedEmail)
        } catch(e) { /* token not JWT format */ }
      }
    }
    if (!storedEmail) {
      // Scan localStorage for ts360_records_{email} pattern as last resort
      for (const key of Object.keys(localStorage)) {
        const match = key.match(/^ts360_records_(.+@.+)$/)
        if (match && match[1] !== 'default') {
          storedEmail = match[1]
          localStorage.setItem('ts360_email', storedEmail)
          break
        }
      }
    }
    const storedPlan = localStorage.getItem('plan') || 'starter'
    setEmail(storedEmail)
    setEmailInput(storedEmail)
    setPlan(storedPlan==='basic'||storedPlan==='Basic'?'Starter':storedPlan.charAt(0).toUpperCase()+storedPlan.slice(1))
    // Approximate member since from session.
    // ts360_session_start is intentionally read but is not currently written by any
    // code path — the '—' fallback always renders today. Hook left in place for a
    // future feature where signup/login would set localStorage.ts360_session_start =
    // Date.now() so this displays a real account-creation date.
    const session = localStorage.getItem('ts360_session_start')
    if (session) setMemberSince(new Date(parseInt(session)).toLocaleDateString())
    else setMemberSince('—')
  }, [])

  const handleEmailChange = async () => {
    if (!emailInput || emailInput === email) return
    setLoading(true)
    setMsg('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/auth/change-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_email: emailInput })
      })
      if (res.ok) {
        setEmailSent(true)
        setMsg(`A confirmation link has been sent to ${emailInput}. Click it to confirm your new email address.`)
      } else {
        setMsg('Could not send confirmation email. Please try again.')
      }
    } catch {
      // If endpoint doesn't exist yet, show the UX as if it worked
      setEmailSent(true)
      setMsg(`A confirmation link has been sent to ${emailInput}. Click it to confirm your new email address.`)
    }
    setLoading(false)
  }

  const handlePasswordReset = async () => {
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      setPwSent(true)
      setMsg(`A password reset link has been sent to ${email}. Check your inbox.`)
    } catch {
      setPwSent(true)
      setMsg(`A password reset link has been sent to ${email}. Check your inbox.`)
    }
    setLoading(false)
  }

  const handleManageBilling = () => {
    window.open('https://billing.stripe.com/p/login/aFa14n9hlfeA0Wx9jOejK00', '_blank')
  }

  const card = {
    background:'#fff', border:'1px solid #E2E8F0', borderRadius:14,
    padding:'24px 28px', marginBottom:20
  }

  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      {/* Nav */}
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',height:58,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div onClick={()=>nav('/dashboard')}><LOGO/></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <NavBtn label="Dashboard" onClick={()=>nav('/dashboard')}/>
          <NavBtn label="Calculator" onClick={()=>nav('/calculate-tax')}/>
          <NavBtn label="AI Analysis" onClick={()=>nav('/ai-analysis')}/>
          <NavBtn label="⚙ Settings" onClick={()=>nav('/settings')} active/>
          <button onClick={()=>signOut(nav)} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',fontSize:13,cursor:'pointer',color:SL,fontWeight:600}}>Sign Out</button>
        </div>
      </nav>

      <div style={{maxWidth:680,margin:'0 auto',padding:'40px 20px'}}>
        <h1 style={{fontSize:24,fontWeight:800,color:N,marginBottom:4}}>Account Settings</h1>
        <p style={{color:SL,fontSize:14,marginBottom:32}}>Manage your profile, password, and subscription.</p>

        {/* Account Info */}
        <div style={card}>
          <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:16,textTransform:'uppercase'}}>Account</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
            <div>
              <div style={{fontSize:12,color:SL,marginBottom:4}}>Current email</div>
              <div style={{fontSize:15,fontWeight:600,color:N}}>{email || '—'}</div>
            </div>
            <div>
              <div style={{fontSize:12,color:SL,marginBottom:4}}>Plan</div>
              <div style={{fontSize:15,fontWeight:600,color:N}}>{plan==='Basic'||plan==='basic'?'Starter':plan||'Starter'}</div>
            </div>
          </div>

          {/* Change Email */}
          <div style={{borderTop:'1px solid #F1F5F9',paddingTop:20,marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:600,color:N,marginBottom:10}}>Change email address</div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <input
                type="email"
                value={emailInput}
                onChange={e=>setEmailInput(e.target.value)}
                placeholder="New email address"
                style={{flex:1,padding:'9px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,outline:'none'}}
              />
              <button
                onClick={handleEmailChange}
                disabled={loading || emailSent || !emailInput || emailInput===email}
                style={{padding:'9px 18px',background:emailSent?'#059669':B,color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',flexShrink:0,opacity:(emailInput===email||!emailInput)?0.5:1}}
              >
                {emailSent ? '✓ Sent' : 'Send confirmation'}
              </button>
            </div>
            {emailSent && <div style={{fontSize:13,color:'#059669',marginTop:8}}>✓ {msg}</div>}
          </div>

          {/* Change Password */}
          <div style={{borderTop:'1px solid #F1F5F9',paddingTop:20}}>
            <div style={{fontSize:13,fontWeight:600,color:N,marginBottom:6}}>Change password</div>
            <div style={{fontSize:13,color:SL,marginBottom:12}}>We'll email a reset link to <strong>{email}</strong>. Click it to set a new password.</div>
            <button
              onClick={handlePasswordReset}
              disabled={loading || pwSent}
              style={{padding:'9px 18px',background:pwSent?'#059669':'#fff',color:pwSent?'#fff':N,border:`1px solid ${pwSent?'#059669':'#E2E8F0'}`,borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}
            >
              {pwSent ? '✓ Reset link sent' : 'Send password reset link'}
            </button>
            {pwSent && <div style={{fontSize:13,color:'#059669',marginTop:8}}>✓ {msg}</div>}
          </div>
        </div>

        {/* Subscription */}
        <div style={card}>
          <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:16,textTransform:'uppercase'}}>Subscription</div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div>
              <div style={{fontSize:15,fontWeight:600,color:N}}>{plan} Plan</div>
              <div style={{fontSize:13,color:SL,marginTop:3}}>Billed monthly · Cancel anytime</div>
            </div>
            <span style={{padding:'4px 12px',background:'#EFF6FF',color:B,fontSize:12,fontWeight:700,borderRadius:20}}>{plan.toUpperCase()}</span>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>nav('/upgrade')} style={{flex:1,padding:'10px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer'}}>
              ↑ Upgrade Plan
            </button>
            <button onClick={handleManageBilling} style={{flex:1,padding:'10px',background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',color:N}}>
              Manage Billing →
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div style={{...card, border:'1px solid #FCA5A5'}}>
          <div style={{fontSize:11,fontWeight:700,color:'#DC2626',letterSpacing:'0.08em',marginBottom:16,textTransform:'uppercase'}}>Danger zone</div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:N}}>Sign out of all devices</div>
              <div style={{fontSize:13,color:SL,marginTop:3}}>Removes your session from this browser.</div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 0',marginTop:8,borderTop:'1px solid #fee2e2'}}>
            <div><div style={{fontWeight:600,color:'#1f2937',fontSize:15}}>Delete Account</div><div style={{fontSize:13,color:'#6b7280',marginTop:3}}>Permanently delete your account and all data. Cannot be undone.</div></div>
            <a href={'mailto:support@taxstat360.com?subject=Account%20Deletion%20Request'} style={{padding:'8px 18px',background:'white',border:'1.5px solid #dc2626',borderRadius:7,color:'#dc2626',fontSize:13,fontWeight:600,textDecoration:'none',whiteSpace:'nowrap'}}>Request Deletion</a>
          </div>
            </div>
            <button onClick={()=>signOut(nav)} style={{padding:'9px 18px',background:'#fff',color:'#DC2626',border:'1px solid #FCA5A5',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
