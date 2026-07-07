import { PLAN_ENTITY_LIMITS } from '../constants.js'
import { getUserPlan } from '../LockedFeature.jsx'
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
