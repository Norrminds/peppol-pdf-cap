# Peppol PDF CAP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone SAP CAP Node.js service that accepts raw Peppol UBL Invoice or CreditNote XML and returns a professional PDF invoice.

**Architecture:** Mount a custom Express route during CAP bootstrap. Keep parsing, normalization, PDF rendering, and HTTP concerns in separate modules so BTP deployment and later renderer/auth changes stay low-risk.

**Tech Stack:** SAP CAP Node.js, Express route mounted by CAP, `raw-body`, `fast-xml-parser`, `pdfmake`, Vitest, Supertest.

---

## File Structure

- Create `.gitignore`: ignore dependencies, generated PDFs, coverage, and local env files.
- Create `package.json`: Node scripts, CAP dependency, runtime libraries, test libraries, BTP-compatible engine.
- Create `server.js`: CAP bootstrap hook; registers health and PDF routes.
- Create `srv/routes/invoice-pdf.js`: raw body reading, optional API key auth, HTTP response/error mapping.
- Create `srv/lib/errors.js`: typed errors with HTTP statuses.
- Create `srv/lib/parse-ubl.js`: safe XML guard, parser setup, document root detection.
- Create `srv/lib/normalize-invoice.js`: UBL Invoice/CreditNote to normalized document model.
- Create `srv/lib/render-pdf.js`: `pdfmake` document definition and PDF buffer generation.
- Create `srv/lib/format.js`: display formatting helpers for dates, amounts, addresses, and missing values.
- Create `srv/lib/filename.js`: safe PDF filename generation.
- Create `test/fixtures/invoice.xml`: minimal valid Peppol-style UBL invoice without SBDH.
- Create `test/fixtures/credit-note.xml`: minimal valid Peppol-style UBL credit note without SBDH.
- Create `test/parse-ubl.test.js`: parser and XML safety tests.
- Create `test/normalize-invoice.test.js`: normalization tests for invoice and credit note.
- Create `test/render-pdf.test.js`: PDF bytes smoke test.
- Create `test/invoice-pdf-route.test.js`: endpoint success, auth, and error tests.
- Create `README.md`: local use, curl examples, iFlow contract, BTP notes.
- Create `mta.yaml`: later Cloud Foundry MTA deployment descriptor.
- Create `manifest.yml`: simple `cf push` deployment option.

## Task 1: Project Scaffold

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `server.js`
- Create: `README.md`
- Create: `mta.yaml`
- Create: `manifest.yml`

- [ ] **Step 1: Add scaffold files**

Create `package.json` with scripts:

```json
{
  "name": "peppol-pdf-cap",
  "version": "1.0.0",
  "private": true,
  "description": "CAP service that converts Peppol UBL invoices and credit notes to PDF.",
  "main": "server.js",
  "scripts": {
    "start": "cds-serve",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=20 <23"
  },
  "dependencies": {
    "@sap/cds": "^8",
    "express": "^4.18.3",
    "fast-xml-parser": "^4.5.0",
    "pdfmake": "^0.2.10",
    "raw-body": "^2.5.2"
  },
  "devDependencies": {
    "@cap-js/cds-types": "^0.8.0",
    "supertest": "^7.0.0",
    "vitest": "^2.1.1"
  }
}
```

Create `server.js` with CAP bootstrap route registration:

```js
const cds = require('@sap/cds')
const { registerInvoicePdfRoutes } = require('./srv/routes/invoice-pdf')

cds.on('bootstrap', app => {
  registerInvoicePdfRoutes(app)
})

module.exports = cds.server
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and install completes.

- [ ] **Step 3: Commit scaffold**

Run:

```bash
git add .gitignore package.json package-lock.json server.js README.md mta.yaml manifest.yml
git commit -m "chore: scaffold CAP PDF service"
```

## Task 2: XML Parser

**Files:**
- Create: `srv/lib/errors.js`
- Create: `srv/lib/parse-ubl.js`
- Create: `test/fixtures/invoice.xml`
- Create: `test/fixtures/credit-note.xml`
- Create: `test/parse-ubl.test.js`

- [ ] **Step 1: Write parser tests**

Cover:

- invoice root is detected as `Invoice`
- credit note root is detected as `CreditNote`
- malformed XML throws a bad request error
- unsupported XML root throws a bad request error
- DTD/entity declarations are rejected

- [ ] **Step 2: Run parser tests to verify failure**

Run:

```bash
npm test -- test/parse-ubl.test.js
```

Expected: FAIL because parser module does not exist.

- [ ] **Step 3: Implement parser**

Implement:

- `AppError` with `status`, `code`, and `message`
- `BadRequestError`, `UnauthorizedError`, `PayloadTooLargeError`
- `parseUblXml(xml)` returning `{ documentType, rootName, document }`

Parser rules:

- reject empty input
- reject `<!DOCTYPE` or `<!ENTITY`
- use `fast-xml-parser` with namespace prefix removal
- accept only `Invoice` and `CreditNote`
- keep tag values as strings

- [ ] **Step 4: Run parser tests**

Run:

```bash
npm test -- test/parse-ubl.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit parser**

Run:

```bash
git add srv/lib/errors.js srv/lib/parse-ubl.js test/fixtures test/parse-ubl.test.js
git commit -m "feat: parse UBL invoice XML"
```

## Task 3: Normalize Invoice Data

**Files:**
- Create: `srv/lib/normalize-invoice.js`
- Create: `srv/lib/format.js`
- Create: `test/normalize-invoice.test.js`

- [ ] **Step 1: Write normalizer tests**

Cover:

- invoice extracts document ID, type, currency, supplier, customer, one line, tax summary, and amount due
- credit note extracts same model shape with type `credit-note`
- missing required supplier/customer/amount fields throws `BadRequestError`

- [ ] **Step 2: Run normalizer tests to verify failure**

Run:

```bash
npm test -- test/normalize-invoice.test.js
```

Expected: FAIL because normalizer module does not exist.

- [ ] **Step 3: Implement normalizer**

Implement helpers:

- `asArray(value)`
- `textAt(object, path, fallback = '')`
- `firstText(paths)`
- `normalizeParty(partyNode)`
- `normalizeLines(documentType, root)`
- `normalizeTaxTotals(root)`
- `normalizeTotals(root)`

Return a model shaped like:

```js
{
  type: 'invoice',
  title: 'Invoice',
  id: 'INV-1000',
  issueDate: '2026-06-05',
  dueDate: '2026-07-05',
  currency: 'EUR',
  supplier: { name, identifiers, vatId, addressLines, contact },
  customer: { name, identifiers, vatId, addressLines, contact },
  references: [{ label, value }],
  payment: { meansCode, paymentId, iban, bic, terms },
  notes: [],
  lines: [{ id, description, quantity, unitCode, unitPrice, taxCategory, taxPercent, lineTotal }],
  taxSubtotals: [{ category, percent, taxableAmount, taxAmount }],
  totals: { net, tax, gross, prepaid, rounding, due }
}
```

- [ ] **Step 4: Run normalizer tests**

Run:

```bash
npm test -- test/normalize-invoice.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit normalizer**

Run:

```bash
git add srv/lib/normalize-invoice.js srv/lib/format.js test/normalize-invoice.test.js
git commit -m "feat: normalize UBL invoice data"
```

## Task 4: PDF Renderer

**Files:**
- Create: `srv/lib/render-pdf.js`
- Create: `test/render-pdf.test.js`

- [ ] **Step 1: Write renderer tests**

Cover:

- `renderInvoicePdf(model)` returns a `Buffer`
- buffer starts with `%PDF`
- invoice ID appears in generated PDF bytes when decoded as latin1 or the renderer completes without throwing if compression hides text

- [ ] **Step 2: Run renderer tests to verify failure**

Run:

```bash
npm test -- test/render-pdf.test.js
```

Expected: FAIL because renderer module does not exist.

- [ ] **Step 3: Implement renderer**

Use `pdfmake` with standard PDF fonts:

```js
const PdfPrinter = require('pdfmake')

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
}
```

Design requirements:

- A4 portrait
- restrained warm-neutral page color
- dark readable text
- muted accent
- top document summary
- supplier/customer columns
- references/payment section
- line table
- VAT summary and totals
- repeated table headers
- footer with generated timestamp

- [ ] **Step 4: Run renderer tests**

Run:

```bash
npm test -- test/render-pdf.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit renderer**

Run:

```bash
git add srv/lib/render-pdf.js test/render-pdf.test.js
git commit -m "feat: render invoice PDF"
```

## Task 5: HTTP Route

**Files:**
- Create: `srv/routes/invoice-pdf.js`
- Create: `srv/lib/filename.js`
- Create: `test/invoice-pdf-route.test.js`
- Modify: `server.js` if route export shape changes

- [ ] **Step 1: Write route tests**

Cover:

- `GET /health` returns JSON status
- `POST /invoice-pdf` with invoice fixture returns `application/pdf`
- `POST /invoice-pdf` with credit note fixture returns `application/pdf`
- invalid XML returns JSON `400`
- unsupported XML returns JSON `400`
- missing API key returns `401` when `PDF_API_KEY` is set
- API key is not required when `PDF_API_KEY` is unset

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
npm test -- test/invoice-pdf-route.test.js
```

Expected: FAIL because route module does not exist.

- [ ] **Step 3: Implement route**

Route behavior:

- `registerInvoicePdfRoutes(app)` registers `GET /health` and `POST /invoice-pdf`
- use `raw-body` with `encoding: 'utf8'`
- size limit from `XML_BODY_LIMIT || '5mb'`
- check `PDF_API_KEY` only when configured
- parse, normalize, render
- set `Content-Type: application/pdf`
- set `Content-Disposition: inline; filename="<safe-id>.pdf"`
- map typed errors to JSON
- log unexpected errors and return generic `500`

- [ ] **Step 4: Run route tests**

Run:

```bash
npm test -- test/invoice-pdf-route.test.js
```

Expected: PASS.

- [ ] **Step 5: Run all tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit route**

Run:

```bash
git add srv/routes/invoice-pdf.js srv/lib/filename.js server.js test/invoice-pdf-route.test.js
git commit -m "feat: expose invoice PDF endpoint"
```

## Task 6: Local Smoke Test and Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-05-peppol-pdf-cap-implementation.md` as steps are checked off

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Start the service manually**

Run:

```bash
npm start
```

Expected: service listens on `http://localhost:4004`.

- [ ] **Step 3: Generate sample invoice PDF**

Run in a second shell:

```bash
curl -sS -X POST \
  -H "Content-Type: application/xml" \
  --data-binary @test/fixtures/invoice.xml \
  http://localhost:4004/invoice-pdf \
  --output invoice.pdf
```

Expected: `invoice.pdf` exists and starts with `%PDF`.

- [ ] **Step 4: Generate sample credit note PDF**

Run:

```bash
curl -sS -X POST \
  -H "Content-Type: application/xml" \
  --data-binary @test/fixtures/credit-note.xml \
  http://localhost:4004/invoice-pdf \
  --output credit-note.pdf
```

Expected: `credit-note.pdf` exists and starts with `%PDF`.

- [ ] **Step 5: Document local and BTP usage**

README must include:

- install command
- test command
- start command
- endpoint contract
- curl examples
- `PDF_API_KEY`
- `XML_BODY_LIMIT`
- `mta.yaml` and `manifest.yml` deployment notes
- iFlow call shape

- [ ] **Step 6: Commit docs and verification artifacts**

Do not commit generated PDF files.

Run:

```bash
git add README.md docs/superpowers/plans/2026-06-05-peppol-pdf-cap-implementation.md
git commit -m "docs: document Peppol PDF service usage"
```

## Final Verification

- [ ] Run `npm test`
- [ ] Run `npm start` and check `GET /health`
- [ ] Generate invoice PDF with `curl`
- [ ] Generate credit note PDF with `curl`
- [ ] Check `git status --short`

Expected final state: tests pass, local service can generate both PDFs, deployment descriptors exist, and generated PDFs are not tracked by git.
