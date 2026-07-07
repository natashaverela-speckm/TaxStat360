import React, { useState, useEffect } from 'react'
import { WEB3FORMS_ACCESS_KEY } from './utils/integrations.js'
import { useNavigate } from 'react-router-dom'
import { signOut, wipeAccountLocalData } from './utils/SignOut'
import { isPro } from './LockedFeature'
import BrandLogo from './BrandLogo'
import { apiGet, apiPost, ApiError } from './utils/apiClient.js'
import { readEmail, writeEmail, readSessionStart, readLoginHistory, readIdleTimeoutMins, writeIdleTimeoutMins, readMfaEnabled, writeMfaEnabled, readBilling, readPlan } from './utils/sessionState.js'
import { refreshPlanFromServer, normalizePlanId } from './LockedFeature.jsx'
import { deleteOwnAccount } from './utils/serverApi.js'

const N = '#0D1B3E', B = '#2563EB', SL = '#475569'

function LOGO() {
  return <BrandLogo size={32} />
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
  // D-09: 'member since' was computed but never rendered — un-shipped display work;
  // value slot silenced, setter kept (surface it on the profile if desired).
  const [, setMemberSince] = useState('')
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('')
  const [billingInterval, setBillingInterval] = useState('monthly')
  const [emailSent, setEmailSent] = useState(false)
  const [pwSent, setPwSent] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // Security & privacy state
  const [idleTimeout, setIdleTimeout] = useState('30')
  const [loginHistory, setLoginHistory] = useState([])
  const [exportDone, setExportDone] = useState(false)

  // Permanent account-deletion (self-service) state
  const [showDelete, setShowDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState('')

  async function handleConfirmDelete() {
    if (confirmText.trim().toUpperCase() !== 'DELETE') return
    setDeleting(true)
    setDeleteErr('')
    try {
      await deleteOwnAccount()
      // Keep support/admin notified as a record — best-effort, never blocks deletion.
      try {
        await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            access_key: WEB3FORMS_ACCESS_KEY,
            subject: 'TaxStat360 — account deleted (self-service)',
            email: email || 'unknown',
            message: `User ${email || 'unknown'} permanently deleted their account on ${new Date().toISOString()}.`,
          }),
        })
      } catch (e) {
        /* notification failure is non-fatal */
      }
      // Erase all local data and land on login with a friendly goodbye (not an auth error).
      wipeAccountLocalData(null, { redirectTo: '/login?deleted=1' })
    } catch (e) {
      setDeleting(false)
      if (e && e.status === 401) {
        setDeleteErr('Your session has expired. Please sign in again before deleting your account.')
      } else {
        setDeleteErr(
          (e && (e.body?.detail || e.message)) ||
            'Deletion failed — your account was not changed. Please try again or contact support.'
        )
      }
    }
  }

  // MFA/2FA state
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaStep, setMfaStep] = useState('idle')
  const [mfaSetupData, setMfaSetupData] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaError, setMfaError] = useState('')
  const [mfaBackupCodes, setMfaBackupCodes] = useState([])

  useEffect(() => {
    const storedEmail = (() => {
      let e = readEmail() || ''
      if (!e) {
        for (const key of Object.keys(localStorage)) {
          const match = key.match(/^ts360_records_(.+@.+)$/)
          if (match && match[1] !== 'default') {
            e = match[1]
            writeEmail(e)
            break
          }
        }
      }
      return e
    })()
    setEmail(storedEmail)
    setEmailInput(storedEmail)

    refreshPlanFromServer().then((plan) => {
      const display = normalizePlanId(plan || readPlan() || 'starter')
      setPlan(display === 'starter' ? 'Starter' : display.charAt(0).toUpperCase() + display.slice(1))
    })

    const storedBilling = readBilling() || 'monthly'
    setBillingInterval(storedBilling === 'annual' ? 'Annual' : 'Monthly')

    const session = readSessionStart()
    if (session) setMemberSince(new Date(parseInt(session)).toLocaleDateString())
    else setMemberSince('—')

    const storedTimeout = readIdleTimeoutMins()
    if (storedTimeout === null) writeIdleTimeoutMins('30')
    setIdleTimeout(storedTimeout ?? '30')

    try {
      const history = JSON.parse(readLoginHistory() || '[]')
      setLoginHistory(history)
    } catch(e) { setLoginHistory([]) }

    apiGet('/auth/mfa/status', { credentials: 'include' })
      .then(data => {
        if (data && typeof data.enabled === 'boolean') {
          setMfaEnabled(data.enabled)
          writeMfaEnabled(data.enabled ? '1' : '0')
        }
      })
      .catch(err => {
        // Preserve prior behavior: a non-ok response is a no-op (leave state as-is); only a
        // network/parse failure falls back to the cached flag.
        if (!(err instanceof ApiError)) {
          setMfaEnabled(readMfaEnabled() === '1')
        }
      })
  }, [])

  const handleEmailChange = async () => {
    if (!emailInput || emailInput === email) return
    setLoading(true)
    setMsg('')
    try {
      await apiPost('/auth/change-email', { new_email: emailInput }, { credentials: 'include' })
      setEmailSent(true)
      setMsg(`A confirmation link has been sent to ${emailInput}. Click it to confirm your new email address.`)
    } catch (e) {
      if (e instanceof ApiError) {
        setMsg((e.body && e.body.detail) || 'Could not send confirmation email. Please try again.')
      } else {
        setMsg('Network error — please check your connection and try again.')
      }
    }
    setLoading(false)
  }

  const handlePasswordReset = async () => {
    setLoading(true)
    setMsg('')
    try {
      await apiPost('/auth/forgot-password', { email })
    } catch(e) { /* intentional — always show success */ }
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
    writeIdleTimeoutMins(val)
  }

  const handleMfaSetup = async () => {
    setMfaLoading(true)
    setMfaError('')
    try {
      const data = await apiPost('/auth/mfa/setup', undefined, { credentials: 'include' })
      setMfaSetupData(data)
      setMfaStep('setup')
    } catch(e) {
      if (e instanceof ApiError) {
        setMfaError((e.body && e.body.detail) || 'Could not initialize MFA setup. Please try again.')
      } else {
        setMfaError(e.message || 'MFA setup failed. Please try again.')
      }
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
      const data = await apiPost('/auth/mfa/verify', { code: mfaCode }, { credentials: 'include' })
      setMfaEnabled(true)
      writeMfaEnabled('1')
      setMfaBackupCodes(data?.backup_codes || mfaSetupData?.backup_codes || [])
      setMfaStep('success')
      setMfaCode('')
    } catch(e) {
      if (e instanceof ApiError) {
        setMfaError((e.body && e.body.detail) || 'Invalid code. Please check your authenticator app and try again.')
      } else {
        setMfaError(e.message || 'Verification failed. Please try again.')
      }
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
      await apiPost('/auth/mfa/disable', { code: mfaCode }, { credentials: 'include' })
      setMfaEnabled(false)
      writeMfaEnabled('0')
      setMfaStep('idle')
      setMfaCode('')
      setMfaSetupData(null)
    } catch(e) {
      if (e instanceof ApiError) {
        setMfaError((e.body && e.body.detail) || 'Invalid code. MFA was not disabled.')
      } else {
        setMfaError(e.message || 'Could not disable MFA. Please try again.')
      }
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

  const sessionStart = readSessionStart()
  const sessionDisplay = sessionStart
    ? new Date(parseInt(sessionStart)).toLocaleString()
    : 'Unknown'

  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      {/* Nav
          U-01 FIX: AI Analysis nav button now conditionally shows 🔒 for non-Pro
          users, matching every other authenticated page (CalculateTaxInner.jsx,
          TaxReturn.jsx, Dashboard). Settings.jsx previously never imported isPro,
          so the lock was always absent here regardless of plan. Also dims the
          button color to '#94A3B8' for non-Pro users, consistent with other navs. */}
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',height:58,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100,overflowX:'auto',minWidth:0}}>
        <div onClick={()=>nav('/dashboard')}><LOGO/></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <NavBtn label="Dashboard"    onClick={()=>nav('/dashboard')}/>
          <NavBtn label="Tax Tracker"  onClick={()=>nav('/calculate-tax')}/>
          {/* U-01 FIX: was <NavBtn label="AI Analysis" .../> — no lock, no isPro check */}
          <button
            onClick={()=>nav('/ai-analysis')}
            style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',color:isPro()?SL:'#94A3B8',fontWeight:600,fontSize:13,cursor:'pointer'}}
          >
            AI Analysis & Reporting{!isPro()?' 🔒':''}
          </button>
          <NavBtn label="Settings"     onClick={()=>nav('/settings')} active/>
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
                        <div style={{fontSize:11,color:'#64748B',marginTop:2,maxWidth:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
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
            <button
              onClick={() => { setShowDelete(true); setConfirmText(''); setDeleteErr('') }}
              style={{padding:'9px 18px',background:'#fff',border:'1.5px solid #DC2626',borderRadius:8,color:'#DC2626',fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}
            >
              Delete account
            </button>
          </div>

          {showDelete && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm account deletion"
              style={{position:'fixed',inset:0,background:'rgba(13,27,62,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
              onClick={() => { if (!deleting) setShowDelete(false) }}
            >
              <div onClick={e => e.stopPropagation()} style={{background:'#fff',borderRadius:14,maxWidth:440,width:'100%',padding:'26px 24px',boxShadow:'0 20px 50px rgba(0,0,0,0.25)'}}>
                <div style={{fontSize:17,fontWeight:700,color:'#DC2626',marginBottom:10}}>Delete your account?</div>
                <div style={{fontSize:13.5,color:SL,lineHeight:1.55,marginBottom:8}}>
                  This permanently deletes your account, cancels your subscription, and erases all of your saved tax records and personal information. <strong>This cannot be undone.</strong>
                </div>
                <div style={{fontSize:13,color:N,marginBottom:8}}>Type <strong>DELETE</strong> to confirm:</div>
                <input
                  autoFocus
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleConfirmDelete() }}
                  placeholder="DELETE"
                  disabled={deleting}
                  style={{width:'100%',boxSizing:'border-box',padding:'10px 12px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,marginBottom:14}}
                />
                {deleteErr && (
                  <div role="alert" style={{fontSize:13,color:'#DC2626',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,padding:'8px 12px',marginBottom:14}}>
                    {deleteErr}
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
                  <button
                    onClick={() => setShowDelete(false)}
                    disabled={deleting}
                    style={{padding:'9px 16px',background:'#fff',color:SL,border:'1px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:deleting?'default':'pointer'}}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={deleting || confirmText.trim().toUpperCase() !== 'DELETE'}
                    style={{padding:'9px 16px',background:(deleting||confirmText.trim().toUpperCase()!=='DELETE')?'#FCA5A5':'#DC2626',color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:(deleting||confirmText.trim().toUpperCase()!=='DELETE')?'default':'pointer'}}
                  >
                    {deleting ? 'Deleting…' : 'Permanently delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
