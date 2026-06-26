import { describe, it, expect } from 'vitest'
import { computeTooltipPosition } from './InfoTip.jsx'

describe('computeTooltipPosition', () => {
  const base = {
    tooltipWidth: 290,
    tooltipHeight: 120,
    viewportWidth: 800,
    viewportHeight: 600,
  }

  it('opens above the trigger when there is room', () => {
    const pos = computeTooltipPosition({
      ...base,
      triggerRect: { top: 200, bottom: 220, left: 100, width: 15, height: 15 },
    })
    expect(pos.above).toBe(true)
    expect(pos.top).toBe(200 - 120 - 6)
    expect(pos.top).toBeGreaterThanOrEqual(0)
  })

  it('flips below when not enough room above', () => {
    const pos = computeTooltipPosition({
      ...base,
      triggerRect: { top: 40, bottom: 60, left: 100, width: 15, height: 15 },
    })
    expect(pos.above).toBe(false)
    expect(pos.top).toBe(60 + 6)
  })

  it('clamps horizontally inside the viewport', () => {
    const pos = computeTooltipPosition({
      ...base,
      triggerRect: { top: 200, bottom: 220, left: 5, width: 15, height: 15 },
    })
    expect(pos.left).toBe(8)
  })
})
