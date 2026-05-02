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
export const ENTITY_TYPES = [
  'Sole Proprietor / Single-Member LLC',
  'Partnership / Multi-Member LLC',
  'S Corporation',
  'C Corporation',
]

// Pass-through entities: K-1 income flows to the owner's personal 1040.
export const PASSTHROUGH_ENTITY_TYPES = [
  'Sole Proprietor / Single-Member LLC',
  'Partnership / Multi-Member LLC',
  'S Corporation',
]

// SE-subject entity types: these drive the 15.3% self-employment tax in calcTaxReturn.
// S-Corp distributions are NOT SE-subject (officer salary is FICA-taxed instead).
export const SE_SUBJECT_TYPES = [
  'Sole Proprietor / Single-Member LLC',
  'Partnership / Multi-Member LLC',
]

// Accounting software integrations config
export const INTEGRATIONS = [
  { id: 'quickbooks', name: 'QuickBooks', color: '#2CA01C', abbr: 'QB' },
  { id: 'xero',       name: 'Xero',       color: '#13B5EA', abbr: 'XE' },
  { id: 'wave',       name: 'Wave',       color: '#2C6ECB', abbr: 'WV' },
  { id: 'freshbooks', name: 'FreshBooks', color: '#1a9c3e', abbr: 'FB' },
]
