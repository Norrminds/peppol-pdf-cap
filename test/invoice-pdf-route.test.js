import { afterEach, describe, expect, test } from 'vitest'
import express from 'express'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import routeModule from '../srv/routes/invoice-pdf.js'

const { registerInvoicePdfRoutes } = routeModule

function fixture(name) {
  return readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')
}

function createApp() {
  const app = express()
  registerInvoicePdfRoutes(app)
  return app
}

afterEach(() => {
  delete process.env.PDF_API_KEY
  delete process.env.XML_BODY_LIMIT
})

describe('invoice PDF route', () => {
  test('returns health status', async () => {
    const response = await request(createApp()).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: 'ok', service: 'peppol-pdf' })
  })

  test('returns a PDF for UBL Invoice XML', async () => {
    const response = await request(createApp())
      .post('/invoice-pdf')
      .set('Content-Type', 'application/xml')
      .send(fixture('invoice.xml'))

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.headers['content-disposition']).toContain('INV-1000.pdf')
    expect(response.body.subarray(0, 4).toString('ascii')).toBe('%PDF')
  })

  test('returns a PDF for UBL CreditNote XML', async () => {
    const response = await request(createApp())
      .post('/invoice-pdf')
      .set('Content-Type', 'application/xml')
      .send(fixture('credit-note.xml'))

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.headers['content-disposition']).toContain('CN-1000.pdf')
    expect(response.body.subarray(0, 4).toString('ascii')).toBe('%PDF')
  })

  test('returns a PDF for StandardBusinessDocument-wrapped UBL Invoice XML', async () => {
    const response = await request(createApp())
      .post('/invoice-pdf')
      .set('Content-Type', 'application/xml')
      .send(fixture('invoice-sbdh.xml'))

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.headers['content-disposition']).toContain('INV-1000.pdf')
    expect(response.body.subarray(0, 4).toString('ascii')).toBe('%PDF')
  })

  test('returns the PDF as hexadecimal for UBL Invoice XML', async () => {
    const response = await request(createApp())
      .post('/invoice-pdf/hex')
      .set('Content-Type', 'application/xml')
      .send(fixture('invoice.xml'))

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/plain')
    expect(response.headers['content-disposition']).toContain('INV-1000.pdf.hex')

    const hex = response.text
    expect(hex).toMatch(/^[0-9a-f]+$/)
    expect(hex.length % 2).toBe(0)
    // Hex-decode and confirm it is the same %PDF document the binary route emits.
    expect(Buffer.from(hex, 'hex').subarray(0, 4).toString('ascii')).toBe('%PDF')
  })

  test('hex route honors the API key when configured', async () => {
    process.env.PDF_API_KEY = 'secret'

    const missingKey = await request(createApp())
      .post('/invoice-pdf/hex')
      .set('Content-Type', 'application/xml')
      .send(fixture('invoice.xml'))

    expect(missingKey.status).toBe(401)
  })

  test('returns JSON 400 for invalid XML', async () => {
    const response = await request(createApp())
      .post('/invoice-pdf')
      .set('Content-Type', 'application/xml')
      .send('<Invoice><broken></Invoice>')

    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.body.error.message).toMatch(/Invalid XML/)
  })

  test('returns JSON 400 for unsupported XML roots', async () => {
    const response = await request(createApp())
      .post('/invoice-pdf')
      .set('Content-Type', 'application/xml')
      .send('<Order><ID>1</ID></Order>')

    expect(response.status).toBe(400)
    expect(response.body.error.message).toMatch(/Unsupported UBL document type/)
  })

  test('requires API key only when PDF_API_KEY is configured', async () => {
    process.env.PDF_API_KEY = 'secret'

    const missingKey = await request(createApp())
      .post('/invoice-pdf')
      .set('Content-Type', 'application/xml')
      .send(fixture('invoice.xml'))

    expect(missingKey.status).toBe(401)

    const validKey = await request(createApp())
      .post('/invoice-pdf')
      .set('Content-Type', 'application/xml')
      .set('X-API-Key', 'secret')
      .send(fixture('invoice.xml'))

    expect(validKey.status).toBe(200)
    expect(validKey.headers['content-type']).toContain('application/pdf')
  })
})
