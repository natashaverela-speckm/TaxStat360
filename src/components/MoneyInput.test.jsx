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

// ─── AUDIT H4 (second launch audit, Sep 2026) — THE DECIMAL POINT WAS EATEN ───
// handleChange stripped with /[^0-9]/g, which removed the '.' along with the '$'
// and the commas, then re-formatted the surviving digits as a whole number. Any
// pasted figure carrying cents was silently multiplied by 100, with no validation
// and no correction at blur. The trigger is completely ordinary — copy-pasting
// gross receipts out of QuickBooks, Xero or Excel, all of which include cents.
//
// The first block is the defect itself. The rest fence the new behaviour so the
// whole-dollar display contract and the caret handling are not collateral damage.
describe('H4 — pasted cents are no longer multiplied by 100', () => {
  const cases = [
    ['$1,234,567.89', '1,234,567.89', '1234567.89', '1,234,568'],
    ['487,334.57',    '487,334.57',   '487334.57',  '487,335'],
    ['7,642.48',      '7,642.48',     '7642.48',    '7,642'],
    ['1234.50',       '1,234.50',     '1234.50',    '1,235'],
  ]
  for (const [pasted, display, rawEmitted, afterBlur] of cases) {
    it(`paste "${pasted}" → ${display}, blurs to ${afterBlur}`, async () => {
      const { getByLabelText, getByTestId } = render(<Harness />)
      const input = getByLabelText('money')
      act(() => type(input, pasted))
      await settle()
      expect(input.value).toBe(display)
      expect(getByTestId('raw-money').textContent).toBe(rawEmitted)
      // Blur rounds to whole dollars, the way parseMoney() does.
      act(() => { fireEvent.blur(input) })
      await settle()
      expect(input.value).toBe(afterBlur)
    })
  }

  it('the specific figure that surfaced this is no longer 48,733,457', async () => {
    const { getByLabelText } = render(<Harness />)
    const input = getByLabelText('money')
    act(() => type(input, '487,334.57'))
    await settle()
    expect(input.value).not.toBe('48,733,457')
  })
})

describe('H4 — typing cents behaves', () => {
  it('accepts a decimal point mid-entry and keeps it', async () => {
    const { getByLabelText, getByTestId } = render(<Harness />)
    const input = getByLabelText('money')
    act(() => type(input, '1500.'))
    await settle()
    expect(input.value).toBe('1,500.')
    act(() => type(input, '1500.7'))
    await settle()
    expect(input.value).toBe('1,500.7')
    expect(getByTestId('raw-money').textContent).toBe('1500.7')
  })

  it('caps cents at two places', async () => {
    const { getByLabelText, getByTestId } = render(<Harness />)
    const input = getByLabelText('money')
    act(() => type(input, '99.98765'))
    await settle()
    expect(input.value).toBe('99.98')
    expect(getByTestId('raw-money').textContent).toBe('99.98')
  })

  it('keeps only the first decimal point', async () => {
    const { getByLabelText } = render(<Harness />)
    const input = getByLabelText('money')
    act(() => type(input, '1.2.3'))
    await settle()
    expect(input.value).toBe('1.23')
  })

  it('handles a negative with cents', async () => {
    const { getByLabelText, getByTestId } = render(<Harness label="neg" />)
    const input = getByLabelText('neg')
    act(() => type(input, '-8,000.49'))
    await settle()
    expect(getByTestId('raw-neg').textContent).toBe('-8000.49')
    act(() => { fireEvent.blur(input) })
    await settle()
    expect(input.value).toBe('-8,000')
  })

  it('a lone decimal point clears at blur instead of erroring', async () => {
    const { getByLabelText, getByTestId } = render(<Harness />)
    const input = getByLabelText('money')
    act(() => type(input, '.'))
    await settle()
    act(() => { fireEvent.blur(input) })
    await settle()
    expect(input.value).toBe('')
    expect(getByTestId('raw-money').textContent).toBe('')
  })

  it('whole-dollar entry is completely unchanged', async () => {
    const { getByLabelText, getByTestId } = render(<Harness />)
    const input = getByLabelText('money')
    act(() => type(input, '250000'))
    await settle()
    expect(input.value).toBe('250,000')
    expect(getByTestId('raw-money').textContent).toBe('250000')
    act(() => { fireEvent.blur(input) })
    await settle()
    expect(input.value).toBe('250,000')
  })
})

// OCT-4 ONCE-OVER M-2 (Oct 2026): the prior-year safe-harbor inputs must be able to return to
// BLANK — a typed "0" and a cleared field mean different things under §6654(e)(2). Step 2 keeps
// coerceEmptyBlurToZero on for every other money field; these two pass false.
describe('OCT-4 M-2 — coerceEmptyBlurToZero', () => {
  function CoerceHarness({ coerce }) {
    const [v, setV] = useState('18,750')
    return (
      <>
        <MoneyInput id="mi-coerce" value={v} onChange={setV} nonNegative coerceEmptyBlurToZero={coerce} ariaLabel="coerce" />
        <output data-testid="raw-coerce">{v}</output>
      </>
    )
  }
  it('SPEC: with coercion ON (default Step 2 behaviour) a cleared field blurs to "0"', async () => {
    const { getByLabelText, getByTestId } = render(<CoerceHarness coerce={true} />)
    const input = getByLabelText('coerce')
    type(input, '')
    fireEvent.blur(input)
    await settle()
    expect(getByTestId('raw-coerce').textContent).toBe('0')
  })
  it('SPEC: with coercion OFF (prior-year tax / AGI) a cleared field stays blank, and a typed 0 stays "0"', async () => {
    const { getByLabelText, getByTestId } = render(<CoerceHarness coerce={false} />)
    const input = getByLabelText('coerce')
    type(input, '')
    fireEvent.blur(input)
    await settle()
    expect(getByTestId('raw-coerce').textContent).toBe('')
    type(input, '0')
    fireEvent.blur(input)
    await settle()
    expect(getByTestId('raw-coerce').textContent).toBe('0')
  })
  it('source: Step 2 passes coerceEmptyBlurToZero={false} on exactly the two prior-year inputs', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, 'TaxReturn.jsx'), 'utf8')
    expect(src).toMatch(/id="tr-prior-tax"[^\n]*coerceEmptyBlurToZero=\{false\}/)
    expect(src).toMatch(/id="tr-prior-agi"[^\n]*coerceEmptyBlurToZero=\{false\}/)
    expect((src.match(/coerceEmptyBlurToZero=\{false\}/g) || []).length).toBe(2)
  })
})
