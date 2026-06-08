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
    expect(serialized).toContain('125.00 EUR')
  })

  test('formats monetary amounts with thousands separators', () => {
    const model = invoiceModel()
    model.totals.due = '12345.67'
    model.totals.net = '12345.67'
    model.totals.tax = '3086.42'
    model.totals.gross = '15432.09'
    model.lines[0].unitPrice = '12345.67'
    model.lines[0].lineTotal = '12345.67'
    model.taxSubtotals[0].taxableAmount = '12345.67'
    model.taxSubtotals[0].taxAmount = '3086.42'

    const definition = buildInvoiceDocDefinition(model, new Date('2026-06-05T12:00:00Z'))
    const serialized = JSON.stringify(definition)

    expect(serialized).toContain('12,345.67 EUR')
    expect(serialized).toContain('3,086.42 EUR')
    expect(serialized).toContain('15,432.09 EUR')
  })

  test('preserves source decimal precision while adding grouping', () => {
    const model = invoiceModel()
    model.totals.due = '12345.6789'
    model.lines[0].unitPrice = '12345.6789'
    model.lines[0].lineTotal = '12345.6000'
    model.taxSubtotals[0].taxableAmount = '12345.6789'
    model.taxSubtotals[0].taxAmount = '3086.4000'

    const definition = buildInvoiceDocDefinition(model, new Date('2026-06-05T12:00:00Z'))
    const serialized = JSON.stringify(definition)

    expect(serialized).toContain('12,345.6789 EUR')
    expect(serialized).toContain('12,345.6000 EUR')
    expect(serialized).toContain('3,086.4000 EUR')
    expect(serialized).not.toContain('12,345.68 EUR')
  })

  test('includes line notes in the PDF document definition', () => {
    const xml = readFileSync(join(import.meta.dirname, 'fixtures', 'tekniska-verken-invoice.xml'), 'utf8')
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
