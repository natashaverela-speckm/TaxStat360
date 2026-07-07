// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import InfoTip, { computeTooltipPosition } from './InfoTip.jsx'

afterEach(cleanup)

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

  it('OBS-8 fix: stays ABOVE when below would overflow the bottom edge', () => {
    // Trigger near the bottom: room above (400px) but only 30px below.
    const pos = computeTooltipPosition({
      ...base,
      triggerRect: { top: 400, bottom: 570, left: 100, width: 15, height: 15 },
    })
    expect(pos.above).toBe(true)
    expect(pos.top + 120).toBeLessThanOrEqual(600)   // fully inside the viewport
  })

  it('OBS-8 fix: when NEITHER side fits, picks the side with more room', () => {
    // Short viewport: 60px above, 120px tooltip, ~25px below → above has more room.
    const pos = computeTooltipPosition({
      ...base,
      viewportHeight: 100,
      triggerRect: { top: 60, bottom: 75, left: 100, width: 15, height: 15 },
    })
    expect(pos.above).toBe(true)
  })

  it('clamps horizontally inside the viewport', () => {
    const pos = computeTooltipPosition({
      ...base,
      triggerRect: { top: 200, bottom: 220, left: 5, width: 15, height: 15 },
    })
    expect(pos.left).toBe(8)
  })
})

// UX AUDIT (Jul 2026) coverage — findings F11 (tab-order data loss),
// F14 (tooltip accessibility), F17 (tap-to-open persistence).
describe('InfoTip trigger accessibility & interaction', () => {
  it('F11: trigger is removed from the sequential tab order', () => {
    const { getByRole } = render(
      React.createElement(InfoTip, { text: 'Total deductible depreciation.' }),
    )
    const btn = getByRole('button')
    expect(btn.getAttribute('tabindex')).toBe('-1')
  })

  it('F14: help text is always in the DOM and linked via aria-describedby', () => {
    const { getByRole } = render(
      React.createElement(InfoTip, { text: 'Rents received before expenses.' }),
    )
    const btn = getByRole('button')
    const descId = btn.getAttribute('aria-describedby')
    expect(descId).toBeTruthy()
    const desc = document.getElementById(descId)
    expect(desc).toBeTruthy()
    expect(desc.textContent).toBe('Rents received before expenses.')
  })

  it('F14: contextual accessible name when label is provided, generic fallback otherwise', () => {
    const { getByRole, unmount } = render(
      React.createElement(InfoTip, { text: 'x', label: 'Depreciation' }),
    )
    expect(getByRole('button').getAttribute('aria-label')).toBe('Help: Depreciation')
    unmount()
    const { getByRole: getByRole2 } = render(React.createElement(InfoTip, { text: 'x' }))
    expect(getByRole2('button').getAttribute('aria-label')).toBe('More information')
  })

  it('F17: click opens a persistent tooltip; second click closes it', () => {
    const { getByRole, queryByRole } = render(
      React.createElement(InfoTip, { text: 'Tap-to-open help.' }),
    )
    const btn = getByRole('button')
    expect(queryByRole('tooltip')).toBeNull()
    fireEvent.click(btn)
    expect(queryByRole('tooltip')).toBeTruthy()
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(btn)
    expect(queryByRole('tooltip')).toBeNull()
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('F14 / WCAG 1.4.13: Escape dismisses an open tooltip', () => {
    const { getByRole, queryByRole } = render(
      React.createElement(InfoTip, { text: 'Dismiss me with Esc.' }),
    )
    fireEvent.click(getByRole('button'))
    expect(queryByRole('tooltip')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(queryByRole('tooltip')).toBeNull()
  })

  it('mouse hover still opens, and mouseleave closes an unpinned tooltip', async () => {
    const { getByRole, queryByRole, container } = render(
      React.createElement(InfoTip, { text: 'Hover help.' }),
    )
    const wrapper = container.firstChild
    fireEvent.mouseEnter(wrapper)
    expect(queryByRole('tooltip')).toBeTruthy()
    fireEvent.mouseLeave(wrapper)
    await new Promise((r) => setTimeout(r, 200)) // 120ms grace period
    expect(queryByRole('tooltip')).toBeNull()
    expect(getByRole('button').getAttribute('aria-expanded')).toBe('false')
  })
})
