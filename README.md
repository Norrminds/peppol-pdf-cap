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

Successful response:

```text
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="<document-id>.pdf"
```

Error responses are JSON:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Invalid XML"
  }
}
```

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

Credit note:

```bash
curl -sS -X POST \
  -H "Content-Type: application/xml" \
  --data-binary @test/fixtures/credit-note.xml \
  http://localhost:4004/invoice-pdf \
  --output credit-note.pdf
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

## iFlow Contract

Configure the iFlow HTTP call as a synchronous request:

- Method: `POST`
- URL: `https://<btp-route>/invoice-pdf`
- Request body: raw Peppol UBL `Invoice` or `CreditNote` XML, no SBDH
- Header: `Content-Type: application/xml`
- Header when configured: `X-API-Key: <PDF_API_KEY>`
- Expected response: PDF bytes with `Content-Type: application/pdf`

The iFlow can store, attach, or forward the PDF response body directly.

## BTP Deployment

This repo includes both:

- `mta.yaml` for MTA-based Cloud Foundry deployment
- `manifest.yml` for a simple `cf push`

The first version does not require HANA, XSUAA, destinations, or Chromium.

Simple Cloud Foundry deployment:

```bash
cf login --sso
cf push
cf set-env peppol-pdf-cap PDF_API_KEY '<shared-secret>'
cf restage peppol-pdf-cap
```

MTA deployment:

```bash
mbt build
cf deploy mta_archives/peppol-pdf-cap_1.0.0.mtar
```

Set `PDF_API_KEY` in the BTP application environment before connecting the iFlow outside local test scenarios.
