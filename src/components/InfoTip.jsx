import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { NAVY as N, SLATE as SL } from '../theme.js'

const MARGIN = 8
const GAP = 6
const TOOLTIP_Z = 9999

/** Pure positioning helper (exported for tests). */
export function computeTooltipPosition({
  triggerRect,
  tooltipWidth,
  tooltipHeight,
  viewportWidth,
  viewportHeight,
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

export default function InfoTip({ text, wide, label }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const hideTimer = useRef(null)
  const tooltipWidth = wide ? 360 : 290

  const open = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    setShow(true)
  }
  const close = () => {
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

  useEffect(() => {
    if (!show) return
    const handler = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (tooltipRef.current?.contains(e.target)) return
      setShow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  const tooltip =
    show &&
    createPortal(
      <div
        ref={tooltipRef}
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
          fontSize: 12,
          lineHeight: 1.65,
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
      onMouseLeave={close}
    >
      <button
        type="button"
        aria-label={label ? `Help: ${label}` : 'More information'}
        aria-expanded={show}
        onClick={() => setShow((s) => !s)}
        onFocus={open}
        onBlur={close}
        style={{
          width: 15,
          height: 15,
          borderRadius: '50%',
          background: '#E2E8F0',
          border: 'none',
          cursor: 'pointer',
          fontSize: 9,
          fontWeight: 700,
          color: SL,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {tooltip}
    </span>
  )
}
