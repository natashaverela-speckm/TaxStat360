// src/components/MoneyInput.jsx
//
// Canonical money input for TaxStat360.
// Replaces every <input type="text" /> + manual onChange parsing in the codebase.
//
// Behavior:
//   - Stores a Number in parent state (never a raw string).
//   - On focus: shows the current value un-formatted for easy editing.
//   - On blur: formats with thousand separators (e.g., "1,234.50").
//   - Pasting "$1,234,567" works correctly (parser handles it).
//   - Mobile shows numeric keyboard via inputMode="decimal".
//   - Uses type="text" (NOT type="number") because type=number disallows
//     commas while typing and breaks paste from spreadsheets.
//
// Usage:
//   <MoneyInput
//     value={state.totalRevenue}                      // a Number from parent
//     onChange={(n) => setState({...state, totalRevenue: n})}  // gets a Number
//     placeholder="0"
//     ariaLabel="Total Revenue"
//   />

import { useState, useEffect } from 'react';
import { parseMoney, formatMoneyForInput } from '../utils/parseMoney.js';

export default function MoneyInput({
  value,
  onChange,
  placeholder = '0',
  ariaLabel,
  id,
  className,
  disabled = false,
  allowNegative = true,
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

    // Parse and notify parent on every keystroke
    let num = parseMoney(raw);
    if (!allowNegative && num < 0) num = Math.abs(num);
    onChange(num);
  }

  function handleFocus() {
    setFocused(true);
    // Show the value without thousand separators for easier editing
    if (value && Number.isFinite(value) && value !== 0) {
      setText(String(value));
    } else {
      setText('');
    }
  }

  function handleBlur() {
    setFocused(false);
    setText(formatMoneyForInput(value ?? 0));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      id={id}
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
