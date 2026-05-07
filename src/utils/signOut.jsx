// src/utils/signOut.js
//
// Single source of truth for sign-out localStorage clearing.
// Called by Settings.jsx, Upgrade.jsx, and any future screen with a sign-out button.
//
// Uses localStorage.clear() rather than a key allowlist — for a financial app
// storing tax records, income, and OAuth tokens, nothing in localStorage should
// outlive a sign-out. A key allowlist approach (the previous pattern) is fragile:
// any new localStorage.setItem() in a feature branch has to also update the allowlist
// or it silently survives sign-out and leaks data on shared computers.
//
// If a future feature needs persistent preferences (theme, dismissed banners, etc.)
// that should survive sign-out, store them under a non-session namespace (e.g.
// 'ts360_pref_*') and add a targeted exemption here with a comment explaining why.

export function signOut(nav) {
  localStorage.clear()
  nav('/')
}
