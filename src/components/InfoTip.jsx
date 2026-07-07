import { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { NAVY as N, SLATE as SL } from '../theme.js'

// ─────────────────────────────────────────────────────────────────────────────
// UX AUDIT (Jul 2026) — this component carries four findings; the fixes are
// deliberately self-contained so NO call-site changes are required:
//
//   F11 (HIGH, data integrity): the "?" trigger sat in the sequential tab order
//        between every money field. A user tabbing input → input landed on the
//        button mid-sequence and keystrokes typed there were silently discarded
//        (reproduced: a rental-expense figure was lost and the liability total
//        recomputed wrong with no error). FIX: tabIndex={-1} — Tab now moves
//        field → field. Pointer/touch access is unchanged; keyboard and
//        screen-reader access is provided via aria-describedby (below), which
//        is the WAI-ARIA-recommended pattern for supplemental help text.
//
//   F14 (HIGH, a11y): tooltip content existed only while hovered, so it never
//        reached the accessibility tree; every trigger announced the identical
//        "More information". FIX: the help text is now ALWAYS in the DOM in a
//        visually-hidden <span>, and the trigger references it with
//        aria-describedby — screen readers hear the actual explanation whether
//        or not the visual tooltip is open. Esc dismisses (WCAG 1.4.13).
//        Pass the `label` prop at call sites for a contextual accessible name
//        ("Help: Depreciation"); the generic fallback remains for
//        backward compatibility.
//
//   F16/F17 (target size): visual glyph grows 15 → 18px and the interactive
//        hit area expands to 28×28 on fine pointers and 44×44 on touch
//        devices via padding + negative margin, so row layout is unaffected.
//        Tap toggles the tooltip open/closed (persisting until Esc, a second
//        tap, or an outside tap) — hover-only help is unusable on phones,
//        which matters for owners reviewing their tax position on the go.
//
// Public API is unchanged: <InfoTip text="..." wide label="Depreciation" />.
// computeTooltipPosition keeps its exact prior contract (tests depend on it).
// ─────────────────────────────────────────────────────────────────────────────

const MARGIN = 8
const GAP = 6
const TOOLTIP_Z = 9999

/** Pure positioning helper (exported for tests). */
export function computeTooltipPosition({
  triggerRect,
  tooltipWidth,
  tooltipHeight,
  viewportWidth,
  // D-09 finding, kept deliberately: viewportHeight is accepted (and passed by the
  // caller) but never used — the above/below flip checks space ABOVE only, so a
  // tooltip near the bottom edge may overflow the viewport. Using this parameter
  // in that check is the likely intended fix; that's a visual behavior change, so
  // it is flagged rather than made in a hygiene batch.
  viewportHeight,   // eslint-disable-line no-unused-vars
  margin = MARGIN,
  gap = GAP,
}) {
  const above = triggerRect.top >= tooltipHeight + margin + gap
  const top = above
    ? triggerRect.top - tooltipHeight - gap
    : triggerRect.bottom + gap
  let left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2
  left = Math.max(margin, Math.min(left, viewportWidth - tooltipWidth - margin))
  const caretLeft = triggerRect.left + triggerRect.width / 2 - left
  return {
    top,
    left,
    above,
    width: tooltipWidth,
    caretLeft: Math.max(12, Math.min(caretLeft, tooltipWidth - 12)),
  }
}

/** Visually hidden but present in the accessibility tree (standard sr-only). */
const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/** True on touch-primary devices; guarded for jsdom/test environments. */
function coarsePointer() {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
  } catch {
    // M5: matchMedia probe failure → assume fine pointer; hover behavior still works.
    return false
  }
}

export default function InfoTip({ text, wide, label }) {
  const [show, setShow] = useState(false)
  // 'hover' closes on mouseleave (with grace); 'pinned' (click/tap) persists
  // until Esc, a second activation, or an outside pointer-down.
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const hideTimer = useRef(null)
  const tooltipWidth = wide ? 360 : 290
  const tipId = useId()
  const descId = `infotip-desc-${tipId}`
  const bubbleId = `infotip-bubble-${tipId}`

  const open = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    setShow(true)
  }
  const close = useCallback(() => {
    setShow(false)
    setPinned(false)
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])
  const closeSoft = () => {
    // Hover-out: only close if the tooltip isn't pinned by a click/tap.
    if (pinned) return
    hideTimer.current = setTimeout(() => setShow(false), 120)
  }

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    if (!trigger || !tooltip) return
    const rect = trigger.getBoundingClientRect()
    const next = computeTooltipPosition({
      triggerRect: rect,
      tooltipWidth,
      tooltipHeight: tooltip.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
    setPos(next)
  }, [tooltipWidth])

  useLayoutEffect(() => {
    if (!show) {
      setPos(null)
      return
    }
    updatePosition()
    const id = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(id)
  }, [show, text, wide, updatePosition])

  useEffect(() => {
    if (!show) return
    const onScrollOrResize = () => updatePosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [show, updatePosition])

  // Outside pointer-down closes (covers pinned tap-open on mobile).
  useEffect(() => {
    if (!show) return
    const handler = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (tooltipRef.current?.contains(e.target)) return
      close()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [show, close])

  // F14 / WCAG 1.4.13 — Escape dismisses the tooltip from anywhere.
  useEffect(() => {
    if (!show) return
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [show, close])

  // F16/F17 — hit-area slop: 28×28 fine-pointer / 44×44 touch, applied as
  // padding with an equal negative margin so the glyph still occupies ~18px
  // of layout and existing label rows don't reflow.
  const slop = coarsePointer() ? 13 : 5

  const tooltip =
    show &&
    createPortal(
      <div
        ref={tooltipRef}
        id={bubbleId}
        role="tooltip"
        style={{
          position: 'fixed',
          top: pos?.top ?? -9999,
          left: pos?.left ?? 0,
          width: tooltipWidth,
          maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
          background: N,
          color: '#fff',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13, // F16: was 12 — dense statutory explanations need legible type
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          textTransform: 'none',
          fontWeight: 400,
          letterSpacing: 'normal',
          textAlign: 'left',
          zIndex: TOOLTIP_Z,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        {text}
        <div
          style={{
            position: 'absolute',
            left: pos?.caretLeft ?? '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            ...(pos?.above
              ? {
                  top: '100%',
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: `6px solid ${N}`,
                }
              : {
                  bottom: '100%',
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderBottom: `6px solid ${N}`,
                }),
          }}
        />
      </div>,
      document.body,
    )

  return (
    <span
      ref={triggerRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}
      onMouseEnter={open}
      onMouseLeave={closeSoft}
    >
      <button
        type="button"
        // F11 FIX — out of the sequential tab order so Tab moves field → field
        // and typed values are never swallowed by a focused help button. Help
        // remains reachable: pointer/touch activate it, and the full text is
        // permanently exposed to assistive tech via aria-describedby below.
        tabIndex={-1}
        aria-label={label ? `Help: ${label}` : 'More information'}
        aria-expanded={show}
        aria-controls={show ? bubbleId : undefined}
        aria-describedby={descId}
        onClick={() => {
          if (show && pinned) {
            close()
          } else {
            setPinned(true)
            open()
          }
        }}
        style={{
          width: 18, // F16: was 15
          height: 18,
          boxSizing: 'content-box',
          padding: slop,
          margin: -slop,
          borderRadius: '50%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#E2E8F0',
            fontSize: 11, // F16: was 9
            fontWeight: 700,
            color: SL,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          ?
        </span>
        {/* F14 FIX — the help text lives in the DOM at all times so screen
            readers can reach it (browse mode, or announced as the trigger's
            description). Visually hidden; the visual tooltip is the portal. */}
        <span id={descId} style={SR_ONLY}>
          {text}
        </span>
      </button>
      {tooltip}
    </span>
  )
}
