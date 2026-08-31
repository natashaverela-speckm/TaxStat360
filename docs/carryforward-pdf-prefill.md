# TaxStat360 — Prefill carryforwards from PDF (Phase 10)

Uses the **same** shared `extract-document` engine as RepsRecord Remy, with profile `tax-1040-carryforward`.

## Retention (important)

| App | Profile | Retention |
|-----|---------|-----------|
| RepsRecord | `reps-activity` | **Keep** in Evidence bucket |
| TaxStat360 | `tax-1040-carryforward` | **Delete-after-processing** — never store tax PDFs in RepsRecord Evidence |

## Flow

1. Professional+ user opens **Carryforward Wizard**
2. Step 1 → **Upload PDF / image**
3. API `POST /extract/tax-1040-carryforward` → shared engine (or local stub)
4. Fields merge into wizard for **review**
5. User edits steps → **Finish** writes session (HITL — no silent overwrite)

## Env (TaxStat360 API)

```
EXTRACT_DOCUMENT_URL=https://ehuttijifubonhhgnvzx.supabase.co/functions/v1/extract-document
EXTRACT_SERVICE_KEY=<shared secret>
EXTRACT_ANON_KEY=<supabase anon key>   # optional, for gateway
```

Edge Function must set the same `EXTRACT_SERVICE_KEY`.

Without the service key, the API returns a **local stub** (safe for dev; use filename `fixture-tax-1040-smoke.pdf` for sample amounts).
