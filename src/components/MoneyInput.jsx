// src/components/MoneyInput.jsx
//
// ⚠ MIGRATION TARGET — NOT YET ADOPTED (Jul 2026).
// Nothing in production imports this component yet. Two divergent local copies
// currently render every money field in the app:
//   • CalculateTaxInner.jsx (~line 57) — passes STRINGS to parent state and
//     live-formats commas with cursor preservation while typing.
//   • TaxReturn.jsx (~line 29)         — its own variant with nonNegative /
//     onError / onClick props.
// This file is the canonical replacement for both. The planned migration (see
// the UX-audit deferral note, batch 3) is deliberately its own change: it moves
// caller state from strings to Numbers across dozens of tax-entry fields —
// rents, depreciation, officer salary — where a silent string/number mismatch
// means a wrong liability figure, so it needs a dedicated test pass, not a
// rider on another batch. Until then this component is tree-shaken from the
// bundle and costs nothing to keep. Do NOT delete it, and do NOT add a third
// local copy — extend this one.
//
// Behavior (once adopted):
//   - Stores a Number in parent state (never a raw string).
//   - On focus: shows the current value un-formatted for easy editing.
//   - On blur: formats with thousand separators (e.g., "1,234.50").
//   - Pasting "$1,234,567" works correctly (parser handles it).
//   - Mobile shows numeric keyboard via inputMode="decimal".
//   - Uses type="text" (NOT type="number") because type=number disallows
//     commas while typing and breaks paste from spreadsheets.
//
// UX AUDIT (Jul 2026) — findings F13 (live totals: onChange fires per keystroke,
// unchanged and load-bearing for the as-you-type liability panel) and F15
// (several money fields exposed NO accessible name because call sites skipped
// `ariaLabel`). Changes here are strictly additive; parsing, formatting, and
// visual behavior are byte-for-byte the same:
//
//   • ariaLabel  — ALWAYS pass this (or associate a <label htmlFor={id}>).
//                  A screen-reader user filling in a rental's income and
//                  depreciation hears only "edit text" otherwise, on the exact
//                  fields where a mistake changes their tax answer.
//   • ariaDescribedby — link the field to its InfoTip help text or hint line.
//   • name / onFocus / onBlur / onKeyDown — pass-throughs so callers can wire
//     autosave-on-blur (audit F1) and Enter-to-advance without wrapping.
//   • enterKeyHint="next" — mobile keyboards show "next" instead of "return",
//     matching the field-to-field entry flow (audit F17).
//
// Usage:
//   <MoneyInput
//     value={state.totalRevenue}                      // a Number from parent
//     onChange={(n) => setState({...state, totalRevenue: n})}  // gets a Number
//     placeholder="0"
//     ariaLabel="Total Revenue"
//     ariaDescribedby="revenue-help"
//   />

import { useState, useEffect } from 'react';
import { parseMoney, formatMoneyForInput } from '../utils/money.js';

export default function MoneyInput({
  value,
  onChange,
  placeholder = '0',
  ariaLabel,
  ariaDescribedby,
  name,
  id,
  className,
  style,
  disabled = false,
  allowNegative = true,
  onFocus,
  onBlur,
  onKeyDown,
}) {
  // Local string state — what the user sees in the field.
  // The parent state is always a Number (truth lives there).
  const [text, setText] = useState(() => formatMoneyForInput(value ?? 0));
  const [focused, setFocused] = useState(false);

  // If parent value changes externally (e.g., loaded record), reflect it.
  // Skip when the user is typing — don't reformat under their cursor.
  useEffect(() => {
    if (!focused) {
      setText(formatMoneyForInput(value ?? 0));
    }
  }, [value, focused]);

  function handleChange(e) {
    const raw = e.target.value;
    setText(raw);

    // Parse and notify parent on every keystroke — this is what drives the
    // live liability panel and delta chip (audit F13: protect this behavior).
    let num = parseMoney(raw);
    if (!allowNegative && num < 0) num = Math.abs(num);
    onChange(num);
  }

  function handleFocus(e) {
    setFocused(true);
    // Show the value without thousand separators for easier editing
    if (value && Number.isFinite(value) && value !== 0) {
      setText(String(value));
    } else {
      setText('');
    }
    if (onFocus) onFocus(e);
  }

  function handleBlur(e) {
    setFocused(false);
    setText(formatMoneyForInput(value ?? 0));
    if (onBlur) onBlur(e);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      enterKeyHint="next"
      autoComplete="off"
      id={id}
      name={name}
      className={className}
      style={style}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedby}
      disabled={disabled}
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
    />
  );
}
