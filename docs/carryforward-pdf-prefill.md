# TaxStat360 — Prefill carryforwards from PDF (Phase 10)

Uses the **same** shared `extract-document` engine as RepsRecord Remy, with profile `tax-1040-carryforward`.

## Retention (important)

| App | Profile | Retention |
|-----|---------|-----------|
| RepsRecord | `reps-activity` | **Keep** in Evidence bucket |
| TaxStat360 | `tax-1040-carryforward` | **Delete-after-processing** — never store tax PDFs in RepsRecord Evidence |

## Flow

1. Professional+ user opens **Carryforward Wizard**
2. Step 1 → **Upload text PDF** (browser + server gates reject image-only and SSN-bearing text — Option C)
3. API `POST /extract/tax-1040-carryforward` → shared engine (or local stub)
4. `mergeTax1040ExtractIntoWizard` maps fields into wizard state for **review** (HITL — no session write yet)
5. User edits steps → **Finish** writes session; **Skip to Personal Return** writes nothing from extract

## HITL contract (Phase 4)

- Extract / gate never call `writePersonalContext`
- Prefill is local React state only until **Finish**
- If extract evidence claims Evidence retention → refuse merge; user enters manually
- Local stub sample amounts: upload filename containing `fixture-tax-1040-smoke` (see `TAX_1040_SMOKE_STUB_FIELDS` / API `_TAX_FIXTURE_FIELDS`)

## Product flag (Phase 5)

`CARRYFORWARD_PDF_PREFILL_ENABLED` in `carryforwardWizardConfig.js` — **on by default**.

| Goal | How |
|------|-----|
| Show upload card | Default (or `VITE_CARRYFORWARD_PDF_PREFILL=true`) |
| Hide upload card (rollback) | Set constant path via `VITE_CARRYFORWARD_PDF_PREFILL=false` at build time, **or** change default in config to `false` |
| Gates / HITL | Stay in code either way — flag only toggles the UI card |

Tab title: `/carryforward-wizard` → `Carryforward Wizard \| TaxStat360`.

**Note:** Live tax AI still requires Natasha ZDR confirmation. Without `EXTRACT_SERVICE_KEY`, API uses local stub only.

## Env (TaxStat360 API)

```
EXTRACT_DOCUMENT_URL=https://ehuttijifubonhhgnvzx.supabase.co/functions/v1/extract-document
EXTRACT_SERVICE_KEY=<shared secret>
EXTRACT_ANON_KEY=<supabase anon key>   # optional, for gateway
TAX_1040_LIVE_EXTRACT=false            # keep false until ZDR confirmed; true enables live tax proxy
```

Edge Function must set the same `EXTRACT_SERVICE_KEY`.

Without the service key **or** without `TAX_1040_LIVE_EXTRACT=true`, the API returns a **local stub** (safe for dev; use filename `fixture-tax-1040-smoke.pdf` for sample amounts). Rate limit: 10/minute. Max upload: 10 MB.

See also: `INTERNAL-TaxStat360-Text-PDF-Runbook.md` (enable/disable, fixtures, ZDR).
