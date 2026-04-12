import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Landing from './Landing'
import Onboarding from './Onboarding'
import Dashboard from './CalculateTax'
import CalculateTax from './CalculateTax'
import AIAnalysis from './AIAnalysis'

// Handles OAuth callbacks from all integrations â marks as connected and returns to dashboard
function OAuthCallback() {
  useEffect(() => {
    // Extract provider from URL path e.g. /integrations/xero/callback
    const { provider = 'unknown' } = useParams()
    localStorage.setItem('ts360_connected_app', provider.charAt(0).toUpperCase() + provider.slice(1))
    localStorage.setItem('ts360_'+provider+'_connected', 'true')
    window.location.href = '/calculate-tax'
  }, [])
  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:12}}>â</div>
        <div style={{fontWeight:700,fontSize:16,color:'#0D1B3E'}}>Connected! Returning to your dashboard...</div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Onboarding screen="signup" />} />
        <Route path="/register" element={<Onboarding screen="signup" />} />
        <Route path="/login" element={<Onboarding screen="login" />} />
        <Route path="/verify-email" element={<Onboarding screen="verify" />} />
        <Route path="/onboarding/entity" element={<Onboarding screen="entity" />} />
        <Route path="/onboarding/business" element={<Onboarding screen="business" />} />
        <Route path="/onboarding/import" element={<Onboarding screen="import" />} />
        <Route path="/calculate-tax" element={<Dashboard />} />
        <Route path="/calculate-tax" element={<CalculateTax />} />
        <Route path="/ai-analysis" element={<AIAnalysis />} />
        <Route path="/integrations/:provider/callback" element={<OAuthCallback />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
