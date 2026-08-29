import { canAccess } from '../components/LockedFeature.jsx'
import { CARRYFORWARD_WIZARD_MIN_PLAN } from './carryforwardWizardConfig.js'

/** True when the signed-in user's plan may use the carryforward wizard. */
export function canAccessCarryforwardWizard() {
  return canAccess(CARRYFORWARD_WIZARD_MIN_PLAN)
}
