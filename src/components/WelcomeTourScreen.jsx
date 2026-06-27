import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { readEmail } from '../utils/sessionState.js'
import { needsOnboardingTour, markOnboardingTourComplete } from '../utils/onboardingTour.js'
import OnboardingTour from './OnboardingTour.jsx'

export default function WelcomeTourScreen() {
  const nav = useNavigate()
  const email = readEmail()

  useEffect(() => {
    if (!needsOnboardingTour(email)) {
      const dest = sessionStorage.getItem('ts360_new_registration') === '1'
        ? '/onboarding/entity'
        : '/dashboard'
      sessionStorage.removeItem('ts360_new_registration')
      nav(dest, { replace: true })
    }
  }, [email, nav])

  if (!needsOnboardingTour(email)) return null

  const finish = () => {
    if (email) markOnboardingTourComplete(email)
    sessionStorage.removeItem('ts360_new_registration')
    nav('/onboarding/entity', { replace: true })
  }

  return <OnboardingTour onComplete={finish} />
}
