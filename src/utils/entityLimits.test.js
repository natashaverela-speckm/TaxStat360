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

  it('professional allows up to 3 business entities', () => {
    vi.mocked(getUserPlan).mockReturnValue('professional')
    const twoBiz = [biz, { type: 'Partnership / LLC' }]
    expect(canAddBusinessEntity(twoBiz)).toBe(true)
    expect(canAddBusinessEntity([...twoBiz, { type: 'C Corporation' }])).toBe(false)
    expect(canAddRealEstateEntity([...twoBiz, rental])).toBe(true)
  })

  it('enterprise is unlimited', () => {
    vi.mocked(getUserPlan).mockReturnValue('enterprise')
    const many = Array.from({ length: 10 }, () => ({ ...biz }))
    expect(entityLimitsForPlan('enterprise').business).toBe(Number.POSITIVE_INFINITY)
    expect(canAddBusinessEntity(many)).toBe(true)
    expect(canAddRealEstateEntity(many)).toBe(true)
  })
})
