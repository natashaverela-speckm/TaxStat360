import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { readEmail, writeFirstRun, readNewRegistration, clearNewRegistration } from '../utils/sessionState.js'
import { needsOnboardingTour, markOnboardingTourComplete } from '../utils/onboardingTour.js'
import OnboardingTour from './OnboardingTour.jsx'

// AUDIT FLOW REVISION (owner decision, July 2026): the tour used to hand off to
// the setup funnel (/onboarding/entity → business → import). That funnel is
// removed — every path out of the welcome tour now lands on /dashboard, where
// the user loads a previously saved record card or starts a new calculation.
// writeFirstRun() moved here from the deleted ImportScreen so the Tax Tracker's
// first-run guidance banner still fires for brand-new users.
export default function WelcomeTourScreen() {
  const nav = useNavigate()
  const email = readEmail()

  useEffect(() => {
    if (!needsOnboardingTour(email)) {
      clearNewRegistration()
      nav('/dashboard', { replace: true })
    }
  }, [email, nav])

  if (!needsOnboardingTour(email)) return null

  const finish = () => {
    if (email) markOnboardingTourComplete(email)
    if (readNewRegistration()) writeFirstRun()
    clearNewRegistration()
    nav('/dashboard', { replace: true })
  }

  return <OnboardingTour onComplete={finish} />
}
