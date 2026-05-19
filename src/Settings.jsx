import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from './utils/signOut'

const N = '#0D1B3E', B = '#2563EB', SL = '#475569'
const API = 'https://app.taxstat360.com'

function LOGO() {
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
      {/* CC-03: Logo background updated navy→blue to match Landing.jsx nav,
          Onboarding.jsx, and logged-in app header (CalculateTaxInner.jsx).
          Bars were already solid white — only the background fill changes. */}
      <div style={{width:32,height:32,background:B,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center'}}>
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

export default function Settings() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('')
  const [billingInterval, setBillingInterval] = useState('monthly')
  const [memberSince, setMemberSince] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [pwSent, setPwSent] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // Security & privacy state
  const [idleTimeout, setIdleTimeout] = useState('30')
  const [loginHistory, setLoginHistory] = useState([])
  const [exportDone, setExportDone] = useState(false)

  // MFA/2FA state
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaStep, setMfaStep] = useState('idle')
  const [mfaSetupData, setMfaSetupData] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaError, setMfaError] = useState('')
  const [mfaBackupCodes, setMfaBackupCodes] = useState([])

  useEffect(() => {
    let storedEmail = localStorage.getItem('ts360_email') || ''
    if (!storedEmail) {
      const token = localStorage.getItem('token') || localStorage.getItem('ts360_session') || ''
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          storedEmail = payload.email || payload.sub || ''
          if (storedEmail) localStorage.setItem('ts360_email', storedEmail)
        } catch(e) {}
      }
    }
    if (!storedEmail) {
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

    // FIX (BILLING-INTERVAL): Read billing interval from localStorage so the
    // Subscription card shows "Annual" or "Monthly" correctly instead of the
    // hardcoded "Billed monthly" that was previously shown for all users.
    const storedBilling = localStorage.getItem('billing') || 'monthly'
    setBillingInterval(storedBilling === 'annual' ? 'Annual' : 'Monthly')

    const session = localStorage.getItem('ts360_session_start')
    if (session) setMemberSince(new Date(parseInt(session)).toLocaleDateString())
    else setMemberSince('—')

    const storedTimeout = localStorage.getItem('ts360_idle_timeout_mins')
    if (storedTimeout === null) localStorage.setItem('ts360_idle_timeout_mins', '30')
    setIdleTimeout(storedTimeout ?? '30')

    try {
      const history = JSON.parse(localStorage.getItem('ts360_login_history') || '[]')
      setLoginHistory(history)
    } catch(e) { setLoginHistory([]) }

    const token = localStorage.getItem('token')
    if (token) {
      fetch(`${API}/auth/mfa/status`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && typeof data.enabled === 'boolean') {
            setMfaEnabled(data.enabled)
            localStorage.setItem('ts360_mfa_enabled', data.enabled ? '1' : '0')
          }
        })
        .catch(() => {
          setMfaEnabled(localStorage.getItem('ts360_mfa_enabled') === '1')
        })
    }
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
        const data = await res.json().catch(() => ({}))
        setMsg(data.detail || 'Could not send confirmation email. Please try again.')
      }
    } catch {
      setMsg('Network error — please check your connection and try again.')
    }
    setLoading(false)
  }

  const handlePasswordReset = async () => {
    setLoading(true)
    setMsg('')
    try {
      await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
    } catch(e) {}
    setPwSent(true)
    setMsg(`A password reset link has been sent to ${email}. Check your inbox.`)
    setLoading(false)
  }

  const handleManageBilling = () => {
    window.open('https://billing.stripe.com/p/login/aFa14n9hlfeA0Wx9jOejK00', '_blank')
  }

  const handleDataExport = () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: email,
      notice: 'This file contains all TaxStat360 data stored on this device for your account. Tax records, session preferences, and account metadata are included.',
      data: {}
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('ts360_') || key === 'plan' || key === 'userName')) {
        try { exportData.data[key] = JSON.parse(localStorage.getItem(key)) }
        catch { exportData.data[key] = localStorage.getItem(key) }
      }
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `taxstat360-data-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExportDone(true)
    setTimeout(() => setExportDone(false), 4000)
  }

  const handleIdleTimeoutChange = (val) => {
    setIdleTimeout(val)
    localStorage.setItem('ts360_idle_timeout_mins', val)
  }

  // ── MFA/ ── MFA/2FA handlers ────────────────────────────────────────────────────────
  const handleMfaSetup = async () => {
    setMfaLoading(true)
    setMfaError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/auth/mfa/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Could not initialize MFA setup. Please try again.')
      }
      const data = await res.json()
      setMfaSetupData(data)
      setMfaStep('setup')
    } catch(e) {
      setMfaError(e.message || 'MFA setup failed. Please try again.')
    }
    setMfaLoading(false)
  }

  const handleMfaVerify = async () => {
    if (!mfaCode || mfaCode.length !== 6) {
      setMfaError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setMfaLoading(true)
    setMfaError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/auth/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: mfaCode })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Invalid code. Please check your authenticator app and try again.')
      }
      const data = await res.json()
      setMfaEnabled(true)
      localStorage.setItem('ts360_mfa_enabled', '1')
      setMfaBackupCodes(data.backup_codes || mfaSetupData?.backup_codes || [])
      setMfaStep('success')
      setMfaCode('')
    } catch(e) {
      setMfaError(e.message || 'Verification failed. Please try again.')
    }
    setMfaLoading(false)
  }

  const handleMfaDisable = async () => {
    if (!mfaCode || mfaCode.length !== 6) {
      setMfaError('Enter your current 6-digit authenticator code to confirm.')
      return
    }
    setMfaLoading(true)
    setMfaError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/auth/mfa/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: mfaCode })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Invalid code. MFA was not disabled.')
      }
      setMfaEnabled(false)
      localStorage.setItem('ts360_mfa_enabled', '0')
      setMfaStep('idle')
      setMfaCode('')
      setMfaSetupData(null)
    } catch(e) {
      setMfaError(e.message || 'Could not disable MFA. Please try again.')
    }
    setMfaLoading(false)
  }

  const resetMfaFlow = () => {
    setMfaStep('idle')
    setMfaCode('')
    setMfaError('')
    setMfaSetupData(null)
  }

  const card = {
    background:'#fff', border:'1px solid #E2E8F0', borderRadius:14,
    padding:'24px 28px', marginBottom:20
  }

  const sessionStart = localStorage.getItem('ts360_session_start')
  const sessionDisplay = sessionStart
    ? new Date(parseInt(sessionStart)).toLocaleString()
    : 'Unknown'

  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      {/* Nav */}
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',height:58,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div onClick={()=>nav('/dashboard')}><LOGO/></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <NavBtn label="Dashboard" onClick={()=>nav('/dashboard')}/>
          <NavBtn label="Calculator" onClick={()=>nav('/calculate-tax')}/>
          <NavBtn label="AI Analysis" onClick={()=>nav('/ai-analysis')}/>
          {/* CC-06: Removed ⚙ gear emoji from nav button — emoji reserved for
              decorative/illustrative use, not navigation or interactive controls. */}
          <NavBtn label="Settings" onClick={()=>nav('/settings')} active/>
          <button onClick={()=>signOut(nav)} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',fontSize:13,cursor:'pointer',color:SL,fontWeight:600}}>Sign Out</button>
        </div>
      </nav>

      <div style={{maxWidth:680,margin:'0 auto',padding:'40px 20px 80px 20px'}}>
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
            {msg && !pwSent && <div style={{fontSize:13,color:emailSent?'#059669':'#DC2626',marginTop:8}}>{emailSent?'✓ ':''}{msg}</div>}
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
              {/* FIX (BILLING-INTERVAL): Show actual billing interval from localStorage
                  instead of hardcoded "Billed monthly". Reads the 'billing' key written
                  by Onboarding.jsx on signup and by the plan picker on signup. */}
              <div style={{fontSize:13,color:SL,marginTop:3}}>Billed {billingInterval.toLowerCase()} · Cancel anytime</div>
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

        {/* Security */}
        <div style={card}>
          <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:20,textTransform:'uppercase'}}>Security</div>

          {/* MFA/2FA */}
          <div style={{marginBottom:24,paddingBottom:24,borderBottom:'1px solid #F1F5F9'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:N,marginBottom:3,display:'flex',alignItems:'center',gap:8}}>
                  Two-Factor Authentication (2FA)
                  <span style={{
                    fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,
                    background: mfaEnabled ? '#F0FDF4' : '#FEF9E7',
                    color: mfaEnabled ? '#059669' : '#D97706',
                    border: `1px solid ${mfaEnabled ? '#86EFAC' : '#FCD34D'}`
                  }}>
                    {mfaEnabled ? '✓ Enabled' : 'Not enabled'}
                  </span>
                </div>
                <div style={{fontSize:13,color:SL,lineHeight:1.5,maxWidth:440}}>
                  Adds a second layer of protection using an authenticator app.
                  Strongly recommended by IRS Publication 4557 for tax software handling taxpayer data.
                </div>
              </div>
              {mfaStep === 'idle' && (
                mfaEnabled ? (
                  <button
                    onClick={() => { setMfaStep('disable'); setMfaError(''); setMfaCode('') }}
                    style={{flexShrink:0,padding:'8px 16px',background:'#fff',color:'#DC2626',border:'1px solid #FCA5A5',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    onClick={handleMfaSetup}
                    disabled={mfaLoading}
                    style={{flexShrink:0,padding:'8px 16px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',opacity:mfaLoading?0.6:1}}
                  >
                    {mfaLoading ? 'Setting up…' : 'Enable 2FA'}
                  </button>
                )
              )}
            </div>

            {mfaError && (
              <div style={{background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#DC2626',marginTop:12}}>
                {mfaError}
              </div>
            )}

            {mfaStep === 'setup' && mfaSetupData && (
              <div style={{marginTop:14,background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:'20px 20px'}}>
                <div style={{fontSize:13,fontWeight:600,color:N,marginBottom:4}}>Step 1 — Scan this QR code</div>
                <div style={{fontSize:13,color:SL,marginBottom:16,lineHeight:1.5}}>
                  Open <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app. Tap "+" and scan the QR code below.
                </div>
                {mfaSetupData.qr_code_url && (
                  <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
                    <img
                      src={mfaSetupData.qr_code_url}
                      alt="MFA QR code — scan with your authenticator app"
                      style={{width:180,height:180,border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',padding:8}}
                    />
                  </div>
                )}
                {mfaSetupData.secret && (
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:12,color:SL,marginBottom:6}}>Can't scan? Enter this key manually in your app:</div>
                    <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:7,padding:'10px 14px',fontFamily:'monospace',fontSize:14,fontWeight:600,color:N,letterSpacing:'0.1em',userSelect:'all'}}>
                      {mfaSetupData.secret}
                    </div>
                  </div>
                )}
                <div style={{fontSize:13,fontWeight:600,color:N,marginBottom:8}}>Step 2 — Enter the 6-digit code</div>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                    placeholder="000000"
                    style={{width:140,padding:'10px 14px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:18,fontWeight:600,color:N,letterSpacing:'0.2em',textAlign:'center',fontFamily:'monospace',outline:'none'}}
                    onKeyDown={e => e.key === 'Enter' && handleMfaVerify()}
                  />
                  <button
                    onClick={handleMfaVerify}
                    disabled={mfaLoading || mfaCode.length !== 6}
                    style={{padding:'10px 20px',background:mfaCode.length===6?'#059669':'#94A3B8',color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:mfaCode.length===6?'pointer':'not-allowed'}}
                  >
                    {mfaLoading ? 'Verifying…' : 'Verify & Enable'}
                  </button>
                  <button onClick={resetMfaFlow} style={{padding:'10px 14px',background:'#fff',color:SL,border:'1px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {mfaStep === 'success' && (
              <div style={{marginTop:14,background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:10,padding:'20px'}}>
                <div style={{fontSize:14,fontWeight:700,color:'#059669',marginBottom:8}}>✓ Two-factor authentication is now active</div>
                {mfaBackupCodes.length > 0 && (
                  <>
                    <div style={{fontSize:13,color:'#166534',marginBottom:12,lineHeight:1.5}}>
                      <strong>Save these backup codes.</strong> If you lose access to your authenticator app, use one of these codes to sign in. Each code can only be used once.
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:14}}>
                      {mfaBackupCodes.map((code, i) => (
                        <div key={i} style={{background:'#fff',border:'1px solid #86EFAC',borderRadius:6,padding:'8px 12px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:N,letterSpacing:'0.1em',textAlign:'center'}}>
                          {code}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        const text = mfaBackupCodes.join('\n')
                        navigator.clipboard?.writeText(text)
                      }}
                      style={{padding:'7px 16px',background:'#fff',color:'#059669',border:'1px solid #86EFAC',borderRadius:7,fontWeight:600,fontSize:12,cursor:'pointer',marginRight:8}}
                    >
                      Copy codes
                    </button>
                  </>
                )}
                <button onClick={resetMfaFlow} style={{padding:'7px 16px',background:'#059669',color:'#fff',border:'none',borderRadius:7,fontWeight:600,fontSize:12,cursor:'pointer'}}>
                  Done
                </button>
              </div>
            )}

            {mfaStep === 'disable' && (
              <div style={{marginTop:14,background:'#FEF9E7',border:'1px solid #FCD34D',borderRadius:10,padding:'20px'}}>
                <div style={{fontSize:13,fontWeight:600,color:'#92400E',marginBottom:8}}>Disable two-factor authentication</div>
                <div style={{fontSize:13,color:'#92400E',marginBottom:14,lineHeight:1.5}}>
                  Enter the current 6-digit code from your authenticator app to confirm. This will remove 2FA from your account.
                </div>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                    placeholder="000000"
                    style={{width:140,padding:'10px 14px',border:'1.5px solid #FCD34D',borderRadius:8,fontSize:18,fontWeight:600,color:N,letterSpacing:'0.2em',textAlign:'center',fontFamily:'monospace',outline:'none'}}
                    onKeyDown={e => e.key === 'Enter' && handleMfaDisable()}
                  />
                  <button
                    onClick={handleMfaDisable}
                    disabled={mfaLoading || mfaCode.length !== 6}
                    style={{padding:'10px 20px',background:mfaCode.length===6?'#DC2626':'#94A3B8',color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:mfaCode.length===6?'pointer':'not-allowed'}}
                  >
                    {mfaLoading ? 'Disabling…' : 'Disable 2FA'}
                  </button>
                  <button onClick={resetMfaFlow} style={{padding:'10px 14px',background:'#fff',color:SL,border:'1px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Idle timeout */}
          <div style={{marginBottom:24}}>
            <div style={{fontSize:13,fontWeight:600,color:N,marginBottom:4}}>Idle session timeout</div>
            <div style={{fontSize:13,color:SL,marginBottom:12}}>Automatically sign you out after a period of inactivity. Applies across all pages.</div>
            <select
              value={idleTimeout}
              onChange={e => handleIdleTimeoutChange(e.target.value)}
              style={{padding:'9px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff',outline:'none',cursor:'pointer'}}
            >
              <option value="0">Never</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
            </select>
            {idleTimeout !== '0' && (
              <div style={{fontSize:12,color:'#059669',marginTop:8}}>
                ✓ You will be signed out after {idleTimeout} minutes of inactivity.
              </div>
            )}
          </div>

          {/* Current session */}
          <div style={{borderTop:'1px solid #F1F5F9',paddingTop:20,marginBottom:24}}>
            <div style={{fontSize:13,fontWeight:600,color:N,marginBottom:12}}>Current session</div>
            <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:8,padding:'12px 16px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:N}}>This browser</div>
                  <div style={{fontSize:12,color:SL,marginTop:2}}>Session started: {sessionDisplay}</div>
                </div>
                <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',background:'#F0FDF4',color:'#059669',borderRadius:20}}>Active</span>
              </div>
            </div>
          </div>

          {/* Login history */}
          <div style={{borderTop:'1px solid #F1F5F9',paddingTop:20}}>
            <div style={{fontSize:13,fontWeight:600,color:N,marginBottom:12}}>Login history</div>
            {loginHistory.length === 0 ? (
              <div style={{fontSize:13,color:SL,background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:8,padding:'14px 16px'}}>
                No login history recorded yet. History is captured from this point forward — up to 10 sessions.
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {loginHistory.slice(0,10).map((entry, i) => (
                  <div key={i} style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:8,padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,color:N,fontWeight: i===0?600:400}}>
                        {new Date(entry.timestamp).toLocaleString()}
                        {i===0&&<span style={{marginLeft:8,fontSize:11,fontWeight:700,color:'#059669'}}>Current</span>}
                      </div>
                      {entry.userAgent && (
                        <div style={{fontSize:11,color:'#94A3B8',marginTop:2,maxWidth:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {entry.userAgent}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>


        {/* Privacy & Data */}
        <div style={card}>
          <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:16,textTransform:'uppercase'}}>Privacy & Data</div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:20}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:N,marginBottom:4}}>Download my data</div>
              <div style={{fontSize:13,color:SL,lineHeight:1.5}}>
                Export a copy of all your TaxStat360 data stored on this device — tax records, session history, and account metadata — as a JSON file. You can request this at any time under CCPA and similar privacy laws.
              </div>
            </div>
            <button
              onClick={handleDataExport}
              style={{flexShrink:0,padding:'9px 18px',background:exportDone?'#059669':'#fff',color:exportDone?'#fff':N,border:`1px solid ${exportDone?'#059669':'#E2E8F0'}`,borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',transition:'all 0.2s'}}
            >
              {exportDone ? '✓ Downloaded' : '⬇ Export data'}
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div style={{...card, border:'1px solid #FCA5A5'}}>
          <div style={{fontSize:11,fontWeight:700,color:'#DC2626',letterSpacing:'0.08em',marginBottom:16,textTransform:'uppercase'}}>Danger Zone</div>

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:N}}>Sign out</div>
              <div style={{fontSize:13,color:SL,marginTop:3}}>Removes your session from this browser.</div>
            </div>
            <button onClick={()=>signOut(nav)} style={{padding:'9px 18px',background:'#fff',color:'#DC2626',border:'1px solid #FCA5A5',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>
              Sign Out
            </button>
          </div>

          <div style={{borderTop:'1px solid #FEE2E2',paddingTop:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:N}}>Delete account</div>
              <div style={{fontSize:13,color:SL,marginTop:3}}>Permanently delete your account and all data. Cannot be undone.</div>
            </div>
            <a href={'mailto:support@taxstat360.com?subject=Account%20Deletion%20Request'} style={{padding:'9px 18px',background:'#fff',border:'1.5px solid #DC2626',borderRadius:8,color:'#DC2626',fontSize:13,fontWeight:600,textDecoration:'none',whiteSpace:'nowrap'}}>
              Request deletion
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
