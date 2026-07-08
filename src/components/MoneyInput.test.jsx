// @vitest-environment jsdom
// src/components/MoneyInput.test.jsx
//
// PHASE 2.5 — the canonical MoneyInput's behavior contract.
// The caret tests exist because cursor-teleporting is the exact bug class
// that got the original M8 attempt parked; they are the regression fence.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { useState } from 'react'
import MoneyInput from './MoneyInput.jsx'

// jsdom has no requestAnimationFrame — run caret callbacks synchronously so
// setSelectionRange effects are observable in the same tick.
beforeEach(() => {
  // Model the real browser's ordering: rAF fires AFTER React commits the new
  // value (a synchronous stub would run before the commit, and the commit's
  // value-set resets the caret — the opposite of production behavior).
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0))
})

const settle = () => act(() => new Promise(r => setTimeout(r, 10)))

function Harness({ allowNegative = true, initial = '', label = 'money' }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <MoneyInput id={`mi-${label}`} value={v} onChange={setV} allowNegative={allowNegative} ariaLabel={label} />
      <output data-testid={`raw-${label}`}>{v}</output>
    </>
  )
}

const type = (input, next, caret) => {
  input.focus()
  fireEvent.change(input, { target: { value: next, selectionStart: caret ?? next.length } })
}

describe('MoneyInput — live formatting', () => {
  it('CHAR: commas appear as you type; onChange receives the raw string', () => {
    const { getByLabelText, getByTestId } = render(<Harness />)
    const input = getByLabelText('money')
    act(() => type(input, '2500'))
    expect(input.value).toBe('2,500')
    expect(getByTestId('raw-money').textContent).toBe('2500')
    act(() => type(input, '2,50000'))
    expect(input.value).toBe('250,000')
    expect(getByTestId('raw-money').textContent).toBe('250000')
  })

  it('CHAR: junk is stripped — paste "$1,250,000 " yields 1,250,000', () => {
    const { getByLabelText, getByTestId } = render(<Harness />)
    const input = getByLabelText('money')
    act(() => type(input, '$1,250,000 '))
    expect(input.value).toBe('1,250,000')
    expect(getByTestId('raw-money').textContent).toBe('1250000')
  })

  it('CHAR: negatives work when allowed (leading minus only), stripped when not', () => {
    const neg = render(<Harness label="money-neg" />)
    const negInput = neg.getByLabelText('money-neg')
    act(() => type(negInput, '-8000'))
    expect(negInput.value).toBe('-8,000')
    expect(neg.getByTestId('raw-money-neg').textContent).toBe('-8000')
    act(() => type(negInput, '-8,0-00'))
    expect(neg.getByTestId('raw-money-neg').textContent).toBe('-8000')

    const nn = render(<Harness allowNegative={false} label="money-nn" />)
    const nnInput = nn.getByLabelText('money-nn')
    act(() => type(nnInput, '-8000'))
    expect(nnInput.value).toBe('8,000')
    expect(nn.getByTestId('raw-money-nn').textContent).toBe('8000')
  })

  it('CHAR: caret stays put when editing mid-number (the M8 regression fence)', async () => {
    const { getByLabelText } = render(<Harness />)
    const input = getByLabelText('money')
    act(() => type(input, '125000'))
    expect(input.value).toBe('125,000')
    // Insert a digit after the "1": "1|25,000" → user types 9 → "19|25,000"-ish raw.
    // Simulated post-keystroke state: value "1925,000", caret at index 2.
    act(() => type(input, '1925,000', 2))
    await settle()
    expect(input.value).toBe('1,925,000')
    // One comma was inserted before the caret (1|9 → 1,9|) — caret lands at 3.
    expect(input.selectionStart).toBe(3)
  })

  it('CHAR: blur normalizes display and emits the canonical numeric string', () => {
    const { getByLabelText, getByTestId } = render(<Harness />)
    const input = getByLabelText('money')
    act(() => type(input, '007000'))
    fireEvent.blur(input)
    expect(input.value).toBe('7,000')
    expect(getByTestId('raw-money').textContent).toBe('7000')
  })

  it('CHAR: external value updates format when not focused (record load path)', () => {
    const { getByLabelText, rerender } = render(<MoneyInput value={60000} onChange={() => {}} ariaLabel="money" />)
    expect(getByLabelText('money').value).toBe('60,000')
    rerender(<MoneyInput value="" onChange={() => {}} ariaLabel="money" />)
    expect(getByLabelText('money').value).toBe('')
    rerender(<MoneyInput value={0} onChange={() => {}} ariaLabel="money" />)
    expect(getByLabelText('money').value).toBe('0')
  })
})
