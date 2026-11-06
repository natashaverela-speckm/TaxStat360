import { PLAN_ENTITY_LIMITS } from '../lib/constants.js'
import { SIMPLE_FLOW_ENABLED } from '../lib/simpleFlow.js'
import { getUserPlan } from '../components/LockedFeature.jsx'
import { isRealEstateEntity } from './entityPredicates.js'

// test seam (D-08): exported for tests only — not a production API.
export function countBusinessEntities(entities) {
  return (entities || []).filter(e => !isRealEstateEntity(e?.type)).length
}

// test seam (D-08): exported for tests only — not a production API.
export function countRealEstateEntities(entities) {
  return (entities || []).filter(e => isRealEstateEntity(e?.type)).length
}

export function entityLimitsForPlan(plan) {
  // PHASE 1b (single plan): one paid plan, no entity caps. Starter (the lapsed
  // fallback) keeps its cap so a cancelled account cannot keep adding entities.
  if (SIMPLE_FLOW_ENABLED && (plan === 'professional' || plan === 'enterprise')) return PLAN_ENTITY_LIMITS.enterprise
  return PLAN_ENTITY_LIMITS[plan] || PLAN_ENTITY_LIMITS.starter
}

export function canAddBusinessEntity(entities) {
  const { business } = entityLimitsForPlan(getUserPlan())
  return countBusinessEntities(entities) < business
}

export function canAddRealEstateEntity(entities) {
  const { realEstate } = entityLimitsForPlan(getUserPlan())
  return countRealEstateEntities(entities) < realEstate
}

/** Plan name shown on the upgrade CTA when the business-entity cap is hit. */
export function upgradeLabelForBusinessCap() {
  return getUserPlan() === 'starter' ? 'Professional' : 'Enterprise'
}

/** Plan name shown on the upgrade CTA when the rental-entity cap is hit. */
export function upgradeLabelForRealEstateCap() {
  return getUserPlan() === 'starter' ? 'Professional' : 'Enterprise'
}
