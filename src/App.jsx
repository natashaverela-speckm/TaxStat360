import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './Landing'
import Onboarding from './Onboarding'
import Dashboard from './Dashboard'
import CalculateTax from './CalculateTax'
import AIAnalysis from './AIAnalysis'

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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/calculate-tax" element={<CalculateTax />} />
        <Route path="/ai-analysis" element={<AIAnalysis />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
