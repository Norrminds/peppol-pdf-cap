import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import parserModule from '../srv/lib/parse-ubl.js'
import normalizerModule from '../srv/lib/normalize-invoice.js'
import rendererModule from '../srv/lib/render-pdf.js'

const { parseUblXml } = parserModule
const { normalizeUblDocument } = normalizerModule
const { buildInvoiceDocDefinition, renderInvoicePdf } = rendererModule

function invoiceModel() {
  const xml = readFileSync(join(import.meta.dirname, 'fixtures', 'invoice.xml'), 'utf8')
  return normalizeUblDocument(parseUblXml(xml))
}

describe('renderInvoicePdf', () => {
  test('builds an A4 invoice document definition with key invoice text', () => {
    const definition = buildInvoiceDocDefinition(invoiceModel(), new Date('2026-06-05T12:00:00Z'))
    const serialized = JSON.stringify(definition)

    expect(definition.pageSize).toBe('A4')
    expect(definition.pageMargins).toEqual([36, 36, 36, 54])
    expect(serialized).toContain('Invoice')
    expect(serialized).toContain('INV-1000')
    expect(serialized).toContain('Nordic Supplier AB')
    expect(serialized).toContain('Customer Company Oy')
    expect(serialized).toContain('Professional services - Consulting services')
    expect(serialized).toContain('Amount due')
  })

  test('includes line notes in the PDF document definition', () => {
    const xml = readFileSync(join(import.meta.dirname, '..', 'samples', 'tekniska-verken-invoice.xml'), 'utf8')
    const model = normalizeUblDocument(parseUblXml(xml))
    const definition = buildInvoiceDocDefinition(model, new Date('2026-06-05T12:00:00Z'))
    const serialized = JSON.stringify(definition)

    expect(serialized).toContain('Period: 2026-05-01 - 2026-05-31')
    expect(serialized).toContain('Mätare: 7359992925686464')
  })

  test('renders a PDF buffer', async () => {
    const buffer = await renderInvoicePdf(invoiceModel(), new Date('2026-06-05T12:00:00Z'))

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF')
    expect(buffer.length).toBeGreaterThan(1000)
  })
})
