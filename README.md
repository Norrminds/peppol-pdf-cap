# Peppol PDF CAP

Standalone SAP CAP Node.js service that converts raw Peppol BIS Billing 3.0 UBL `Invoice` and `CreditNote` XML documents into professional PDF invoices.

The service is designed for synchronous SAP Integration Suite iFlow calls:

```text
POST /invoice-pdf
raw UBL XML -> application/pdf
```

## Local Development

```bash
npm install
npm test
npm start
```

The CAP server listens on `http://localhost:4004` by default.

## Endpoints

```text
GET /health
POST /invoice-pdf
```

`POST /invoice-pdf` accepts raw XML without SBDH and returns `application/pdf`.

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PDF_API_KEY` | No | unset | When set, callers must send `X-API-Key` with this value. |
| `XML_BODY_LIMIT` | No | `5mb` | Maximum accepted XML request body size. |
| `PORT` | No | `4004` | CAP server port. |

## Smoke Test

```bash
curl -sS -X POST \
  -H "Content-Type: application/xml" \
  --data-binary @test/fixtures/invoice.xml \
  http://localhost:4004/invoice-pdf \
  --output invoice.pdf
```

With API key enabled:

```bash
PDF_API_KEY=secret npm start

curl -sS -X POST \
  -H "Content-Type: application/xml" \
  -H "X-API-Key: secret" \
  --data-binary @test/fixtures/invoice.xml \
  http://localhost:4004/invoice-pdf \
  --output invoice.pdf
```

## BTP Deployment

This repo includes both:

- `mta.yaml` for MTA-based Cloud Foundry deployment
- `manifest.yml` for a simple `cf push`

The first version does not require HANA, XSUAA, destinations, or Chromium.
