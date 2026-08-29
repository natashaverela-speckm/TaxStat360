// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import CarryforwardStepOffer from './CarryforwardStepOffer.jsx'

afterEach(() => {
  cleanup()
})

describe('CarryforwardStepOffer', () => {
  it('CHAR: Start calls onStartGuide', () => {
    const onStartGuide = vi.fn()
    const onSkip = vi.fn()
    render(<CarryforwardStepOffer onStartGuide={onStartGuide} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: /Start the carryforward guide/ }))
    expect(onStartGuide).toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('CHAR: Skip calls onSkip', () => {
    const onStartGuide = vi.fn()
    const onSkip = vi.fn()
    render(<CarryforwardStepOffer onStartGuide={onStartGuide} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: /Skip — continue to personal return/ }))
    expect(onSkip).toHaveBeenCalled()
    expect(onStartGuide).not.toHaveBeenCalled()
  })
})
