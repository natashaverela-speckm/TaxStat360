import { PLAN_ENTITY_LIMITS } from '../lib/constants.js'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  countBusinessEntities,
  countRealEstateEntities,
  canAddBusinessEntity,
  canAddRealEstateEntity,
  entityLimitsForPlan,
} from './entityLimits.js'

vi.mock('../components/LockedFeature.jsx', () => ({
  getUserPlan: vi.fn(() => 'starter'),
}))

import { getUserPlan } from '../components/LockedFeature.jsx'

const biz = { type: 'S Corporation' }
const rental = { type: 'Real Estate (Schedule E)' }

describe('entityLimits', () => {
  beforeEach(() => {
    vi.mocked(getUserPlan).mockReturnValue('starter')
  })

  it('counts business and real estate separately', () => {
    const entities = [biz, rental, rental]
    expect(countBusinessEntities(entities)).toBe(1)
    expect(countRealEstateEntities(entities)).toBe(2)
  })

  it('starter allows 1 business and blocks a 2nd', () => {
    expect(canAddBusinessEntity([])).toBe(true)
    expect(canAddBusinessEntity([biz])).toBe(false)
  })

  it('starter allows rentals while a business entity exists', () => {
    const oneBiz = [biz]
    expect(canAddRealEstateEntity(oneBiz)).toBe(true)
    expect(canAddRealEstateEntity([biz, rental, rental, rental])).toBe(false)
  })

  it('starter allows a business entity when only rentals are present', () => {
    expect(canAddBusinessEntity([rental, rental, rental])).toBe(true)
  })

  it('pro is unlimited (single plan, Nov 2026)', () => {
    vi.mocked(getUserPlan).mockReturnValue('pro')
    const many = Array.from({ length: 10 }, () => ({ ...biz }))
    expect(entityLimitsForPlan('pro').business).toBe(Number.POSITIVE_INFINITY)
    expect(canAddBusinessEntity(many)).toBe(true)
    expect(canAddRealEstateEntity([...many, rental, rental, rental, rental])).toBe(true)
  })

  it('a retired tier name falls back to the no-plan cap (only pro is a plan)', () => {
    vi.mocked(getUserPlan).mockReturnValue('enterprise')
    expect(entityLimitsForPlan('enterprise')).toEqual(PLAN_ENTITY_LIMITS.starter)
  })
})
