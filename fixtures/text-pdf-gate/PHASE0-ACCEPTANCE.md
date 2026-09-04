# Phase 0 — Text-PDF gate acceptance (locked)

**INTERNAL.** Synthetic fixtures only. No real returns / no real SSNs.

**Fixture dir:** `taxstat360/fixtures/text-pdf-gate/`  
**Regenerate:** `python3 generate_fixtures.py` (needs `reportlab`, `Pillow`, `pypdf`)

---

## Locked decisions (v1)

| # | Decision | Lock |
|---|----------|------|
| 1 | **SSN-bearing text PDF policy** | **Option C** — **block** upload / extract if any SSN-like pattern is found in the text layer (`SSN_DETECTED`). Do not send the original PDF. Phase 1 still builds `detect` + `redact` helpers so we can upgrade to Option A (redacted text payload) later without redoing fixtures. |
| 2 | **Image / scanned PDF** | **Reject** (`IMAGE_ONLY_PDF`). No OCR in this milestone. |
| 3 | **Mixed PDF** (text + image pages) | Gate uses **text layer only**. If text passes the “text PDF” threshold, apply SSN rules to that text; **do not** OCR image pages. Pixels may contain an SSN — accepted residual risk until scanned path ships. |
| 4 | **Libraries** | **Browser (Phase 2):** pdf.js. **API / scripts (Phase 0–3):** `pypdf`. Same acceptance thresholds on both sides. |
| 5 | **“Text PDF” threshold** | After extracting all pages’ text: collapse whitespace; count alphanumeric chars. **Text PDF** if `alnum >= 40`. Else **image-only**. (Verified: clean≈355, with-ssn≈285, mixed≈81, image-only=0.) |
| 6 | **SSN-like patterns (Phase 1 will implement)** | (a) `\b\d{3}-\d{2}-\d{4}\b` (b) `\b\d{3}\s\d{2}\s\d{4}\b` (c) undashed `\b\d{9}\b` only when near SSN context words (`SSN`, `social security`, `Social Security Number`) **or** when not matching EIN shape. |
| 7 | **EIN false positive** | `\b\d{2}-\d{7}\b` is **EIN**, not SSN. Clean fixture includes `12-3456789` and must **pass**. |
| 8 | **Already masked** | `XXX-XX-XXXX`, `***-**-****`, `###-##-####` are **not** SSN hits. |
| 9 | **Product flag** | Phase 5: **on** by default. Rollback: `VITE_CARRYFORWARD_PDF_PREFILL=false` or set default false in config. |
| 10 | **Live provider** | Tax profile stays **stub** until Natasha confirms ZDR in writing — redaction/gate alone does not authorize live tax bytes. |

**Fake SSN used in fixtures:** `219-09-9999` / `219099999` (synthetic only).

---

## Fixtures

| File | Text layer? | SSN in text? | Expected gate |
|------|-------------|--------------|---------------|
| `fixture-tax-1040-text-clean.pdf` | Yes (alnum ≫ 40) | No (EIN only) | **ALLOW** → continue to extract |
| `fixture-tax-1040-text-with-ssn.pdf` | Yes | Yes (dashed + undashed) | **BLOCK** `SSN_DETECTED` |
| `fixture-tax-1040-image-only.pdf` | No (alnum = 0) | No (pixels only) | **BLOCK** `IMAGE_ONLY_PDF` |
| `fixture-tax-1040-mixed.pdf` | Yes on p1 (alnum ≥ 40) | No | **ALLOW** (text-layer rules only; p2 image ignored) |
| `fixture-tax-1040-smoke.pdf` | Yes, clean | No | **ALLOW**; filename token for API local stub sample amounts |

---

## Acceptance table (input → outcome)

| # | Input | Classify | SSN detect | HTTP / UI | Notes |
|---|--------|----------|------------|-----------|--------|
| A1 | `text-clean.pdf` | text | none | proceed | Happy path |
| A2 | `text-with-ssn.pdf` | text | hit | `SSN_DETECTED` | No network send of raw PDF from browser; server rejects if somehow sent |
| A3 | `image-only.pdf` | image-only | n/a | `IMAGE_ONLY_PDF` | Clear “scanned/image PDF not supported yet” copy |
| A4 | `mixed.pdf` | text | none | proceed | Threshold on full-doc text extract |
| A5 | `smoke.pdf` | text | none | proceed + stub fields | Dev/stub only |
| A6 | `.png` / `.jpg` upload | n/a | n/a | reject file type | v1 = PDF only |
| A7 | Empty / corrupt PDF | fail extract | n/a | reject | Stable error, no SSN in logs |
| A8 | Text with EIN `12-3456789` only | text | none | proceed | False-positive guard |
| A9 | Text with only `XXX-XX-XXXX` | text | none | proceed | Already masked |

---

## Stable error codes (Phases 2–3)

| Code | When |
|------|------|
| `IMAGE_ONLY_PDF` | Below text threshold / no usable text layer |
| `SSN_DETECTED` | SSN-like pattern in extracted text |
| `UNSUPPORTED_FILE_TYPE` | Not `application/pdf` |
| `PDF_UNREADABLE` | Parse/extract failure |

Log **codes + counts only** — never raw SSN, never full return text.

---

## Phase 0 verification (done when)

- [x] Decisions locked in this file
- [x] Fixtures generated (synthetic)
- [x] `pypdf` smoke: image-only alnum=0; clean/ssn/mixed above threshold; SSN only in `text-with-ssn`
- [x] Regenerate script committed beside fixtures
- [ ] Product flag still `false` (unchanged)

---

## Next: Phase 2

Browser gate: pdf.js text extract → classify → `hasSsnLike` → block `SSN_DETECTED` / `IMAGE_ONLY_PDF` before `apiFetch`. Keep upload flag off until Phases 2–4.
