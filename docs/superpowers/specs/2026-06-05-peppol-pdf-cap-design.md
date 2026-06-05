# Peppol PDF CAP Design

Date: 2026-06-05

## Goal

Build a standalone SAP CAP Node.js application that can be tested locally first and deployed to SAP BTP later. The service is called synchronously by an SAP Integration Suite iFlow.

The service accepts a Peppol BIS Billing 3.0 UBL `Invoice` or `CreditNote` XML document without SBDH in the raw HTTP request body and returns a professional paper-invoice-style PDF in the HTTP response.

## Non-Goals

- No SBDH parsing in the first version.
- No database persistence.
- No asynchronous job handling.
- No SAP Forms Service by Adobe integration in the first version.
- No headless Chromium, Puppeteer, or Playwright dependency in the runtime.
- No company-specific branding template unless added later.

## API Contract

Endpoint:

```text
POST /invoice-pdf
```

Request:

- Body: raw XML UBL `Invoice` or `CreditNote`
- Content types accepted: `application/xml`, `text/xml`, `application/octet-stream`, or no content type
- Optional authentication: if `PDF_API_KEY` is set, caller must send `X-API-Key: <value>`

Response on success:

- Status: `200`
- Content-Type: `application/pdf`
- Content-Disposition: `inline; filename="<document-id>.pdf"`
- Body: PDF bytes

Error responses:

- `400`: invalid XML, unsupported document type, or missing required invoice fields
- `401`: missing or invalid API key when `PDF_API_KEY` is configured
- `413`: request body exceeds configured XML size limit
- `500`: unexpected rendering failure

Error bodies are JSON so the iFlow can log meaningful details.

Health endpoint:

```text
GET /health
```

Response:

- Status: `200`
- Body: JSON service status, useful for local checks and BTP route health checks.

## Architecture

Use a CAP Node.js project with a custom Express route mounted during CAP bootstrap, for example with `cds.on('bootstrap', app => ...)`. CAP remains useful for BTP-compatible project structure and deployment conventions, while the PDF endpoint stays a normal HTTP route because it is not an OData use case.

Primary modules:

- `server.js`: CAP bootstrap hook and Express route registration.
- `srv/routes/invoice-pdf.js`: HTTP route, body handling, auth check, response headers.
- `srv/lib/parse-ubl.js`: XML parsing and document-type detection.
- `srv/lib/normalize-invoice.js`: maps UBL `Invoice` and `CreditNote` XML into one internal document model.
- `srv/lib/render-pdf.js`: builds a `pdfmake` document definition and returns PDF bytes.
- `srv/lib/errors.js`: typed errors and HTTP error mapping.
- `test/`: focused parser, normalization, auth, and endpoint tests.

## Data Flow

1. The iFlow posts raw XML to `/invoice-pdf`.
2. The route checks `PDF_API_KEY` only if it is configured.
3. The route reads the request body as raw text with a configurable size limit.
4. The XML parser rejects malformed XML and unsupported roots.
5. The normalizer extracts a stable invoice model from UBL `Invoice` or `CreditNote`.
6. The PDF renderer turns the normalized model into a `pdfmake` document definition.
7. The route returns the PDF as `application/pdf` with a sanitized filename.

The default XML size limit should be conservative, such as `5mb`, and overrideable with an environment variable such as `XML_BODY_LIMIT`.

## Normalized Document Model

The first version extracts the fields needed for a complete paper invoice:

- Document type: invoice or credit note
- Document ID
- Issue date and due date
- Currency
- Supplier name, identifier, VAT ID, address, contact fields
- Customer name, identifier, VAT ID, address, contact fields
- Delivery date or period when present
- Buyer reference, order reference, contract reference, and accounting cost when present
- Payment means, payment ID, IBAN, BIC, and payment terms when present
- Line items: line number, description/name, quantity, unit, unit price, discount/charge summary, VAT category/rate, line total
- Tax totals and subtotals by VAT category and rate
- Monetary totals: net amount, tax amount, gross amount, prepaid amount, rounding amount, amount due
- Notes and legal/payment terms

The model should tolerate optional UBL fields, but fail fast if the document cannot produce a meaningful PDF, such as missing document ID, supplier, customer, currency, or payable total. Values from the UBL document are used for presentation. The first version should not recalculate legal invoice totals or claim Peppol validation beyond structural parsing and required display fields.

XML parsing must be local and safe:

- Do not fetch external resources.
- Do not process external entities.
- Reject DTD or entity declarations if the chosen parser exposes them.
- Treat all text values as untrusted input and escape or sanitize where the PDF engine requires it.

## PDF Design

The PDF should look like a professional paper invoice, not a web page screenshot.

Visual direction:

- A4 portrait.
- Warm off-white page background with dark neutral text.
- Muted blue-gray accent used sparingly for headings, rules, and status labels.
- Clear top header showing `Invoice` or `Credit Note`, document ID, issue date, due date, and amount due.
- Supplier and customer blocks near the top for fast identification.
- A compact metadata band for references and payment identifiers.
- Line-item table optimized for scanning: description first, right-aligned quantities/prices/totals.
- VAT summary and totals block near the bottom, with amount due visually strongest.
- Footer with generated timestamp and document metadata.

The renderer must support multi-page invoices. Repeated table headers and sensible page margins are required.

## PDF Engine

Use `pdfmake` instead of Chromium-based PDF generation.

Reasoning:

- SAP BTP Cloud Foundry does not provide Chromium as a standard runtime dependency for Node.js apps.
- Avoiding Chromium keeps deployment simpler and more stable.
- `pdfmake` is pure JavaScript and gives deterministic PDF output.
- The invoice layout is structured enough that a programmatic PDF definition is appropriate.

The rendering module should hide `pdfmake` details behind a function such as:

```js
async function renderInvoicePdf(documentModel) => Buffer
```

This keeps the API and parser independent from the PDF engine if the renderer changes later.

## Local Testing

Local run target:

```text
npm start
```

Local test command:

```text
npm test
```

Manual smoke test:

```text
curl -X POST \
  -H "Content-Type: application/xml" \
  --data-binary @test/fixtures/invoice.xml \
  http://localhost:4004/invoice-pdf \
  --output invoice.pdf
```

If `PDF_API_KEY` is configured:

```text
curl -X POST \
  -H "Content-Type: application/xml" \
  -H "X-API-Key: <key>" \
  --data-binary @test/fixtures/invoice.xml \
  http://localhost:4004/invoice-pdf \
  --output invoice.pdf
```

## BTP Deployment Readiness

The first implementation should include files that make later SAP BTP deployment straightforward:

- `package.json` with supported Node engine and start script.
- `mta.yaml` for Cloud Foundry deployment of a single Node.js module.
- `manifest.yml` as a simpler `cf push` option if desired.
- Environment variable documentation for `PDF_API_KEY` and body size limit.

No HANA, XSUAA, destination, or connectivity service is required for the first version.

## Security

For local testing, the endpoint is unauthenticated when `PDF_API_KEY` is unset.

For BTP/iFlow testing, set `PDF_API_KEY` and configure the iFlow HTTP receiver/sender call to include:

```text
X-API-Key: <configured key>
```

This is intentionally simple. A later production version can replace or supplement it with XSUAA/OAuth without changing the XML-to-PDF contract.

## Testing Strategy

Automated tests should cover:

- Valid UBL Invoice returns a PDF.
- Valid UBL CreditNote returns a PDF.
- Invalid XML returns `400`.
- Unsupported XML root returns `400`.
- Missing API key returns `401` when `PDF_API_KEY` is set.
- No API key is required when `PDF_API_KEY` is unset.
- Normalizer extracts key supplier, customer, line, tax, and total fields.
- Generated PDF bytes start with a PDF header.

Fixtures should include at least one invoice and one credit note without SBDH.

## Open Extension Points

Likely later improvements:

- Company-specific logo and colors.
- Additional Peppol profile validation.
- SBDH support.
- OAuth/XSUAA authentication.
- Optional HTML preview route for development only.
- SAP Forms Service by Adobe renderer adapter if SAP-native template management becomes preferable.
