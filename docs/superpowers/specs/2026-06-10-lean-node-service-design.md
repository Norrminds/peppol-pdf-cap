# Lean Node service variant — design

**Date:** 2026-06-10
**Branch:** `lean-node-service`
**Status:** Implemented

## Problem

`peppol-pdf-cap` is built on SAP CAP (`@sap/cds`), but the service is a stateless
XML→PDF microservice with no database, no OData entities, no XSUAA, and no
destinations. CAP earns its weight on data-modelled, OData/persistence-backed
apps; here it contributes nothing but a large dependency tree and a `cds-serve`
boot wrapper.

### Evidence that CAP is unused

`@sap/cds` was referenced in exactly two places:

| Location | What CAP did |
| --- | --- |
| `server.js` | `cds.on('bootstrap', app => …)` only to obtain the underlying **Express** `app`; `cds-serve` to boot it |
| `test/cap-*.test.js` | Two tests that assert CAP internals (`auth: dummy`, model loads) |

Everything else was already framework-agnostic:
- `srv/lib/*` (parse-ubl, normalize-invoice, render-pdf, format, errors, filename) — plain Node
- `srv/routes/invoice-pdf.js` — plain Express handlers
- `srv/service.cds` — an **empty** service (`service PdfService {}`)
- The main route test already ran against a bare `express()` instance

## Goal

Same use case and HTTP contract, leaner runtime: a plain Express service with
the CAP framework removed. Zero change to parsing/normalization/rendering logic.

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| HTTP layer | Keep Express | Already a direct dep and used in tests; handlers need no rewrite |
| Express version | Upgrade `^4.18.3` → `^5.1.0` | v5 is current stable; auto-catches async rejections; static routes are unaffected by v5 path-matching changes (verified via context7) |
| Body reading | `express.raw()` (built-in) | Drops the direct `raw-body` dependency; `raw-body` remains only transitively under Express |
| Deployment | Keep `manifest.yml`, drop `mta.yaml` | `cf push` + Node.js buildpack still deploys to BTP CF; MTA is CAP/SAP packaging this variant no longer needs |
| Layout | Keep `srv/lib` + `srv/routes` | Minimal churn; existing tests stay green |

## Changes

1. **`server.js`** — boot Express directly; listen on `PORT || 4004` behind a
   `require.main === module` guard; export `app`.
2. **`srv/routes/invoice-pdf.js`** — split the inline handler into middleware:
   `requireApiKey` (runs first, preserving auth-before-body ordering) →
   `readXmlBody` (wraps `express.raw({ type: '*/*', limit })`, resolved per
   request, mapping `entity.too.large` → `PayloadTooLargeError`) → async handler
   that reads `req.body.toString('utf8')`. A final 4-arg error-handling
   middleware maps `AppError`s to their JSON shape and everything else to a 500.
   Express 5 forwards rejected promises from the async handler to it
   automatically, so the per-handler `try/catch` is gone.
3. **`package.json`** — `start`: `cds-serve` → `node server.js`; remove
   `@sap/cds`, `@cap-js/cds-types`, `raw-body`, and the `cds` config block; bump
   `express` to `^5.1.0`.
4. **Deleted** — `srv/service.cds`, `mta.yaml`, `test/cap-auth-config.test.js`,
   `test/cap-model.test.js`.
5. **`README.md`** — drop CAP/MTA/`cds-serve` references; single `cf push`
   deployment path; "CAP runtime port" → "HTTP server port".

## Contract (unchanged)

```
GET  /health        → 200 { status, service }
POST /invoice-pdf   → 200 application/pdf  (UBL Invoice/CreditNote or SBD wrapper)
                      400 invalid/unsupported XML, 401 bad API key,
                      413 oversized body, 500 render failure
```

Runtime config (`PDF_API_KEY`, `XML_BODY_LIMIT`, `PORT`, `NODE_ENV`) is unchanged.

## Verification

- `npm test` — 22 tests pass across 4 files (the 2 removed tests were CAP-only).
- Live smoke test: `/health` → ok; `POST /invoice-pdf` with the invoice fixture →
  `200 application/pdf`, `Content-Disposition: inline; filename="INV-1000.pdf"`,
  a valid 4309-byte `%PDF`; invalid XML → `400` JSON error.

## Rename

On the `lean-node-service` branch the app identifier was renamed
`peppol-pdf-cap` → `peppol-pdf` (package name, `manifest.yml` app name, health
response `service` field + its test assertion, Postman collection filename, and
all README references). The PDF footer branding changed `by Peppol PDF CAP` →
`by Peppol PDF`. The GitHub repository keeps the name `peppol-pdf-cap`, and the
`master` branch (the CAP build) is left untouched.

The PDF output was confirmed unchanged by the rename and the CAP removal:
rendering the fixtures through the `master` and lean render code with an
identical injected timestamp produced byte-identical content streams; the only
differences were pdfkit's per-render `/CreationDate` and `/ID` metadata, which
vary on every render regardless of branch.

## Out of scope

No changes to PDF layout, UBL parsing rules, normalization, or the security
model. No rename of the GitHub repository or the `master` branch.
