// src/components/MoneyInput.jsx
//
// PHASE 2.5 (M8 disposition, Jul 2026) — THE CANONICAL MONEY INPUT.
//
// Owner decision (Jul 8): live thousands-separator formatting — "commas appear
// as you type" — is the product standard for money fields. Steps 1 and 2
// already had it via two near-identical local components (the D-12/D-13
// duplication); the What-If Simulator's delta inputs did not. This file is the
// single shared implementation: adopted first by the simulator (closing the
// user-visible gap with zero churn to the 54 working fields), with the two
// legacy local copies in CalculateTaxInner.jsx and TaxReturn.jsx slated to
// re-point here during Phase-4 housekeeping.
//
// Behavior contract (pinned in MoneyInput.test.jsx):
//   • Formats live: typing 250000 renders 250,000 as digits land.
//   • Caret stays put: the comma-count delta before the caret is applied via
//     requestAnimationFrame, so editing mid-number never teleports the cursor
//     (the bug class that got the original M8 attempt parked).
//   • onChange always receives the RAW string (digits, optional leading
//     minus) — never commas — so nf()/parseFloat consumers are unaffected.
//   • allowNegative (default true) permits a leading minus; false strips it
//     (the Step-1 audit-F9 semantics for fields where negatives are invalid).
//   • Blur normalizes the display and emits the canonical numeric string.
//   • type="text" + inputMode="decimal": selection APIs work (type="number"
//     forbids them) and mobile keyboards show digits.

import { useState, useEffect } from 'react'

// PHASE 4 HOUSEKEEPING (D-12/D-13, Jul 8 2026): this component now serves ALL
// three former implementations. Superset props added for the Step-1/Step-2
// adapters: nonNegative (Step 2's flag name; also clamps at blur and strips
// minus while typing), onError (Step 2's invalid-blur messaging), onClick
// (Step 2 passthrough), and coerceEmptyBlurToZero (Step 2's nf('')===0 blur
// semantics — an empty field normalizes to '0' on blur there, and must keep
// doing so). Absent these props, behavior is exactly the Phase-2.5 contract
// the simulator ships with. One deliberate micro-unification, documented in
// the CHANGELOG: a lone '-' at blur now clears everywhere (Step 1 previously
// left it in place — strictly worse UX, pinned nowhere).
export default function MoneyInput({
  value, onChange, placeholder, style, disabled, id,
  allowNegative = true, nonNegative = false, ariaLabel,
  onClick, onError, coerceEmptyBlurToZero = false,
}) {
  const [raw, setRaw] = useState(value || '')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      const n = parseFloat(String(value ?? '').replace(/,/g, ''))
      setRaw(Number.isFinite(n) && n !== 0
        ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
        : (value === 0 || value === '0' ? '0' : (value || '')))
    }
  }, [value, focused])

  const handleChange = (e) => {
    const input = e.target
    const cursorPos = input.selectionStart
    const prevVal = input.value
    const prevCommasBefore = (prevVal.slice(0, cursorPos).match(/,/g) || []).length

    const allowNeg = !nonNegative && allowNegative !== false
    const stripped = allowNeg
      ? input.value.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '')
      : input.value.replace(/[^0-9]/g, '')
    const isNeg = stripped.startsWith('-')
    const digits = stripped.replace(/^-/, '')
    const n = parseInt(digits, 10)
    const formatted = stripped === '' ? '' : stripped === '-' ? '-' :
      (isNeg ? '-' : '') + (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : digits)

    setRaw(formatted)
    onChange(stripped)
    if (onError) onError('')

    requestAnimationFrame(() => {
      if (input && document.activeElement === input) {
        const newCommasBefore = (formatted.slice(0, cursorPos).match(/,/g) || []).length
        const diff = newCommasBefore - prevCommasBefore
        const newPos = Math.max(0, Math.min(cursorPos + diff, formatted.length))
        input.setSelectionRange(newPos, newPos)
      }
    })
  }

  const handleBlur = () => {
    setFocused(false)
    let n = parseFloat(String(raw).replace(/,/g, ''))
    if (!Number.isFinite(n) && raw === '' && coerceEmptyBlurToZero) n = 0
    if (Number.isFinite(n)) {
      const safeN = nonNegative ? Math.max(0, n) : n
      setRaw(safeN.toLocaleString('en-US', { maximumFractionDigits: 0 }))
      onChange(String(safeN))
      if (onError) onError('')
    } else if (raw === '-' || raw === '') {
      setRaw('')
      onChange('')
    } else {
      setRaw('')
      onChange('')
      if (onError) onError('Enter a number \u2265 0')
    }
  }

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type="text"
      inputMode="decimal"
      value={raw}
      disabled={disabled}
      placeholder={placeholder || '0'}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onClick={onClick}
      style={style}
    />
  )
}
