import {
  buildInitialWizardValues,
  getCarryforwardWizardFieldKeys,
} from './carryforwardWizardConfig.js'
import { readPersonalContext, writePersonalContext, writeDirtyFlag } from '../utils/sessionState.js'
import { formatMoneyForInput, nf, parseMoney } from '../utils/money.js'

/** Map stored context value to MoneyInput string (0 / missing → empty). */
export function contextValueToWizardInput(v) {
  if (v === '' || v === null || v === undefined) return ''
  const n = nf(v)
  if (n === 0) return ''
  return formatMoneyForInput(n)
}

function contextValueForField(ctx, fieldKey) {
  if (fieldKey === 'priorYearQBILoss') {
    return ctx.priorYearQBILoss ?? ctx.priorYearLosses
  }
  // Legacy wizard step 2 wrote Form 8582 PAL to priorSuspendedLoss — treat as alias.
  if (fieldKey === 'priorPassiveLossCarryforward') {
    const pal = ctx.priorPassiveLossCarryforward
    if (pal !== '' && pal != null && nf(pal) !== 0) return pal
    return ctx.priorSuspendedLoss
  }
  return ctx[fieldKey]
}

/** Prefill wizard state from current personal context. */
export function loadWizardValuesFromContext(ctx = readPersonalContext()) {
  const values = buildInitialWizardValues()
  for (const fieldKey of getCarryforwardWizardFieldKeys()) {
    values[fieldKey] = contextValueToWizardInput(contextValueForField(ctx, fieldKey))
  }
  return values
}

/** Build manifest updates from wizard values; omit untouched empty fields. */
export function buildWizardContextUpdates(values) {
  const updates = {}
  for (const fieldKey of getCarryforwardWizardFieldKeys()) {
    const raw = values[fieldKey]
    if (raw === '' || raw === null || raw === undefined) continue
    updates[fieldKey] = parseMoney(raw)
  }
  if (updates.priorYearQBILoss !== undefined) {
    updates.priorYearLosses = updates.priorYearQBILoss
  }
  return updates
}

/** Merge carryforward updates into session personal context. Returns true if written. */
export function saveWizardValuesToContext(values) {
  const updates = buildWizardContextUpdates(values)
  if (Object.keys(updates).length === 0) return false
  const current = readPersonalContext()
  writePersonalContext({ ...current, ...updates })
  writeDirtyFlag(true)
  return true
}
