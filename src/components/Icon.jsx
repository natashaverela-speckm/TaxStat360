// src/Icon.jsx
// Shared SVG icon set for TaxStat360.
//
// Replaces emoji-used-as-icons across the marketing, about, onboarding, and
// resources surfaces with ONE consistent line-icon language in the brand
// palette (navy #0D1B3E / blue #2563EB / slate #475569). Emoji render
// differently on every OS/browser; these render identically everywhere and
// inherit whatever color the surrounding context needs.
//
// Usage:
//   import Icon from './Icon'
//   <Icon name="office" size={32} color="#0D1B3E" />
//
// Design notes:
//   - 24x24 viewBox, stroke-based, 1.8 stroke (matches the geometric, lightly
//     rounded language of the TaxStat360 bar-chart logo).
//   - Color is driven by the `color` prop via currentColor, so one prop controls
//     both strokes and the few filled accents.
//   - Decorative by default: aria-hidden, because adjacent text carries the
//     meaning. Pass a `title` only when the icon must stand alone for a11y.

import React from 'react'

const ICONS = {
  // 🏛️ institution / IRS credential
  institution: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M3.5 9.5h17" />
      <path d="M6 11v7M10 11v7M14 11v7M18 11v7" />
      <path d="M3 18h18M2.5 20.5h19" />
    </>
  ),
  // 🏢 office building — S-Corporations
  office: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <circle cx="9" cy="7.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="13" cy="7.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="9" cy="11.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="13" cy="11.5" r="0.7" fill="currentColor" stroke="none" />
      <path d="M10.5 21v-3.5h3V21" />
    </>
  ),
  // 🤝 partners / collaboration — Partnerships & CPA-compatible
  partners: (
    <>
      <circle cx="9" cy="8" r="2.6" />
      <path d="M3.8 19a5.2 5.2 0 0 1 10.4 0" />
      <circle cx="16.5" cy="9" r="2.1" />
      <path d="M15 13.4A4.4 4.4 0 0 1 20.4 17.6" />
    </>
  ),
  // 📋 document / clipboard — Schedule C / planning disclaimer
  document: (
    <>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <rect x="9" y="3" width="6" height="4" rx="1" fill="currentColor" stroke="none" />
      <path d="M8.5 11h7M8.5 14h7M8.5 17h4" strokeWidth="1.5" />
    </>
  ),
  // 🏠 home — Real estate
  home: (
    <>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  // 💼 briefcase — W-2 + business owner / S-Corp salary
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M3 12.5h18" />
    </>
  ),
  // 🏗️ layers / stack — Multiple entities
  layers: (
    <>
      <path d="M12 3.2 20.5 8 12 12.8 3.5 8 12 3.2Z" />
      <path d="M3.5 12 12 16.8 20.5 12" />
      <path d="M3.5 16 12 20.8 20.5 16" />
    </>
  ),
  // 📊 ascending bars — Tax compliance (mirrors the TaxStat360 logo mark)
  chartBar: (
    <>
      <rect x="4" y="13" width="3.6" height="7" rx="1" fill="currentColor" stroke="none" />
      <rect x="10.2" y="9" width="3.6" height="11" rx="1" fill="currentColor" stroke="none" />
      <rect x="16.4" y="5" width="3.6" height="15" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  // ⚖️ scales — Proactive planning / reasonable compensation
  scales: (
    <>
      <path d="M12 4.5v15M8.5 19.5h7" />
      <path d="M6 7.5h12" />
      <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
      <path d="M6 7.5 3.5 12.5h5L6 7.5Z" />
      <path d="M18 7.5 15.5 12.5h5L18 7.5Z" />
    </>
  ),
  // 🎯 target — Real-time clarity
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  // 🛡️ shield + check — Compliance-first
  shield: (
    <>
      <path d="M12 3 20 6v5c0 5-4 8.4-8 9.9-4-1.5-8-4.9-8-9.9V6l8-3Z" />
      <path d="M9 12l2 2 4-4" strokeWidth="1.7" />
    </>
  ),
  // 🔒 / 🔐 padlock — Security / encryption
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
      <path d="M12 16v2" />
    </>
  ),
  // 📧 envelope — Email
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </>
  ),
  // ✅ check in circle — Success / confirmation
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" strokeWidth="1.7" />
    </>
  ),
  // 📉 downward trend — QBI deduction (lowers what you owe)
  chartDown: (
    <>
      <path d="M4 5v15h15" />
      <path d="M7.5 10 11 13.5 13.5 11 19 16.5" />
      <path d="M19 12.5v4h-4" />
    </>
  ),
  // 📅 calendar — Quarterly estimated taxes
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9.5h16M8.5 3v4M15.5 3v4" />
      <circle cx="8.5" cy="13" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="13" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="17" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  // ✓ plain check — CPA-compatible trust signal
  check: (
    <>
      <path d="M5 12.5l4 4 10-10" />
    </>
  ),
}

export const ICON_NAMES = Object.keys(ICONS)

export default function Icon({
  name,
  size = 24,
  color = '#0D1B3E',
  strokeWidth = 1.8,
  title,
  style,
  ...rest
}) {
  const glyph = ICONS[name]
  if (!glyph) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
      style={{ color, display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {glyph}
    </svg>
  )
}
