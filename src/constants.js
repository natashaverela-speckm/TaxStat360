// src/constants.js
// Single source of truth for shared constants across TaxStat360.
// Import from here — never hard-code these values in individual files.
// API base URL — backend for accounting-software OAuth + P&L pulls.
export const API_BASE_URL = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
// FICA rates — IRC §3101 / §3111
// Employee and employer shares are symmetric (each 6.2% SS / 1.45% Medicare).
// SS portion is capped at TAX_TABLES[year].ssWageBase (see taxCalc.js).
// The 0.9% Additional Medicare Tax (IRC §3101(b)(2)) is handled separately in calcTaxReturn.
export const FICA_SS_RATE = 0.062         // per side; combined 12.4% on SS-subject wages
export const FICA_MEDICARE_RATE = 0.0145  // per side; combined 2.9% uncapped
// Corporate income tax rate — IRC §11
// Flat 21% post-TCJA (P.L. 115-97, enacted 2017-12-22, permanent).
export const C_CORP_TAX_RATE = 0.21
// Entity type display labels — used in dropdowns and entity cards.
// Note: Partnership / Multi-Member LLC is split into "Active" and "Passive" variants
// per IRC §1402(a)(13) — limited partners' distributive shares are excluded from SE tax.
// See SE_SUBJECT_TYPES below: only the Active variant is SE-subject.
export const ENTITY_TYPES = [
  'Sole Proprietor / Single-Member LLC',
  'Partnership / MMLLC — Active',
  'Partnership / MMLLC — Passive',
  'S Corporation',
  'C Corporation',
]
// Pass-through entities: K-1 income flows to the owner's personal 1040.
// Both Active and Passive partnership variants are pass-through (file Form 1065).
export const PASSTHROUGH_ENTITY_TYPES = [
  'Sole Proprietor / Single-Member LLC',
  'Partnership / MMLLC — Active',
  'Partnership / MMLLC — Passive',
  'S Corporation',
]
// SE-subject entity types: these drive the 15.3% self-employment tax in calcTaxReturn.
// S-Corp distributions are NOT SE-subject (officer salary is FICA-taxed instead).
// Per IRC §1402(a)(13), limited partners and passive members are excluded from SE income —
// only the Active partnership variant is SE-subject (general partners and material participants).
export const SE_SUBJECT_TYPES = [
  'Sole Proprietor / Single-Member LLC',
  'Partnership / MMLLC — Active',
]
// Accounting software integrations config
export const INTEGRATIONS = [
  { id: 'quickbooks', name: 'QuickBooks', color: '#2CA01C', bg: '#F0FBF0', abbr: 'QB' },
  { id: 'xero',       name: 'Xero',       color: '#13B5EA', bg: '#EFF9FF', abbr: 'XE' },
  { id: 'wave',       name: 'Wave',       color: '#2C6ECB', bg: '#EFF4FF', abbr: 'WV' },
  { id: 'freshbooks', name: 'FreshBooks', color: '#1a9c3e', bg: '#F0FBF4', abbr: 'FB' },
]

// Ownership percentage fallback convention
// Throughout the codebase, entity ownership is parsed as:
//   (parseInt(e.own) || 100) / 100
// This pattern defaults to 100% for any missing or invalid value (NaN from '', undefined,
// null, or non-numeric input), which is the correct behavior for the most common user
// scenario (sole owner = 100% automatically when the field is blank).
//
// Known limitation: explicit '0' ownership is also treated as 100% because 0 is falsy
// in JavaScript and triggers the || fallback. This is an accepted trade-off — a 0%
// ownership stake (silent partner with no income allocation) is not a realistic scenario
// for TaxStat360's target users (business owners and real estate investors who are
// active majority owners). If 0% ownership becomes a real use case, replace the
// || fallback with Number.isFinite() at all 11 call sites across 4 files:
//   CalculateTaxInner.jsx (5 sites), TaxReturn.jsx (1), AIAnalysis.jsx (2), taxCalc.js (1)
// and add 3 sites from the officer salary reduce calls that use the same pattern.
// Tracked as F-07-followup-A in the audit followup list.
