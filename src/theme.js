// src/theme.js
// Design token constants for TaxStat360.
// Import from here instead of hard-coding hex values in components.
// All components currently use inline styles — these tokens keep colors consistent.

// ── Brand palette ──────────────────────────────────────────────────────────────
export const NAVY  = '#0D1B3E'  // primary text, nav background, hero sections
export const BLUE  = '#2563EB'  // primary action, links, focus rings
export const SLATE = '#475569'  // secondary text, labels, muted UI
export const GREEN = '#16a34a'  // positive values, success states
export const RED   = '#dc2626'  // negative values, error states

// ── Semantic aliases (use these in components, not raw hex) ────────────────────
export const COLOR_TEXT_PRIMARY   = NAVY
export const COLOR_TEXT_SECONDARY = SLATE
export const COLOR_ACTION         = BLUE
export const COLOR_POSITIVE       = GREEN
export const COLOR_NEGATIVE       = RED

// ── Button tokens — FIX (C-04) ────────────────────────────────────────────────
// Rule: BLUE for primary CTAs. NAVY is for brand/nav surfaces — NOT buttons.
// Using NAVY on a CTA (e.g. "Load & Continue") is the inconsistency C-04 flags.
//
//   Primary CTA   (Continue, Save, Start Trial, Load & Continue) → BTN_PRIMARY_BG
//   Secondary     (Sign Out, Settings, Cancel, outlined actions)  → BTN_SECONDARY_*
//   Destructive   (Delete, Disconnect)                            → BTN_DANGER_*
//
// Quick migration: replace hardcoded '#0D1B3E' on action buttons with BTN_PRIMARY_BG.
// NAVY stays correct for nav bars, hero backgrounds, and section fills.
export const BTN_PRIMARY_BG     = BLUE         // '#2563EB'
export const BTN_PRIMARY_TEXT   = '#FFFFFF'
export const BTN_SECONDARY_BG   = '#FFFFFF'
export const BTN_SECONDARY_TEXT = NAVY         // '#0D1B3E'
export const BTN_SECONDARY_BORDER = '#E2E8F0'  // matches BORDER_DEFAULT
export const BTN_DANGER_BG      = '#FFFFFF'
export const BTN_DANGER_TEXT    = RED          // '#dc2626'
export const BTN_DANGER_BORDER  = '#FECACA'    // red-200

// ── Amber — warnings (audit risk banners, AMT notices, estimated tax reminders) ─
export const AMBER_BG     = '#FEF3C7'
export const AMBER_BORDER = '#F59E0B'
export const AMBER_TEXT   = '#92400E'

// ── Info / blue tints ─────────────────────────────────────────────────────────
export const INFO_BG     = '#EFF6FF'
export const INFO_BORDER = '#BFDBFE'
export const INFO_TEXT   = '#1E40AF'

// ── Surface / neutral ─────────────────────────────────────────────────────────
export const SURFACE        = '#F8FAFC'  // page background
export const SURFACE_CARD   = '#FFFFFF'  // card / panel background
export const BORDER_DEFAULT = '#E2E8F0'  // default borders
export const BORDER_LIGHT   = '#F1F5F9'  // dividers inside cards
