import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import parserModule from '../srv/lib/parse-ubl.js'
import normalizerModule from '../srv/lib/normalize-invoice.js'

const { parseUblXml } = parserModule
const { normalizeUblDocument } = normalizerModule

function parsedFixture(name) {
  const xml = readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')
  return parseUblXml(xml)
}

describe('normalizeUblDocument', () => {
  test('normalizes UBL Invoice data needed for a paper invoice PDF', () => {
    const model = normalizeUblDocument(parsedFixture('invoice.xml'))

    expect(model.type).toBe('invoice')
    expect(model.title).toBe('Invoice')
    expect(model.id).toBe('INV-1000')
    expect(model.issueDate).toBe('2026-06-05')
    expect(model.dueDate).toBe('2026-07-05')
    expect(model.currency).toBe('EUR')
    expect(model.supplier.name).toBe('Nordic Supplier AB')
    expect(model.supplier.vatId).toBe('SE559999999901')
    expect(model.supplier.addressLines).toContain('Supplier Street 1')
    expect(model.customer.name).toBe('Customer Company Oy')
    expect(model.customer.vatId).toBe('FI12345678')
    expect(model.references).toContainEqual({ label: 'Buyer reference', value: 'BUYER-REF-1' })
    expect(model.references).toContainEqual({ label: 'Order reference', value: 'PO-7788' })
    expect(model.payment.iban).toBe('SE3550000000054910000003')
    expect(model.payment.bic).toBe('ESSESESS')
    expect(model.payment.terms).toBe('30 days net')
    expect(model.lines).toHaveLength(1)
    expect(model.lines[0]).toMatchObject({
      id: '1',
      description: 'Professional services - Consulting services',
      quantity: '4',
      unitCode: 'HUR',
      unitPrice: '25.00',
      taxCategory: 'S',
      taxPercent: '25',
      lineTotal: '100.00'
    })
    expect(model.taxSubtotals).toEqual([
      { category: 'S', percent: '25', taxableAmount: '100.00', taxAmount: '25.00' }
    ])
    expect(model.totals).toMatchObject({
      net: '100.00',
      tax: '25.00',
      gross: '125.00',
      due: '125.00'
    })
  })

  test('normalizes UBL CreditNote data into the same model shape', () => {
    const model = normalizeUblDocument(parsedFixture('credit-note.xml'))

    expect(model.type).toBe('credit-note')
    expect(model.title).toBe('Credit Note')
    expect(model.id).toBe('CN-1000')
    expect(model.issueDate).toBe('2026-06-06')
    expect(model.currency).toBe('EUR')
    expect(model.supplier.name).toBe('Nordic Supplier AB')
    expect(model.customer.name).toBe('Customer Company Oy')
    expect(model.lines).toHaveLength(1)
    expect(model.lines[0]).toMatchObject({
      id: '1',
      description: 'Credit for services - Returned consulting services',
      quantity: '4',
      unitCode: 'HUR',
      unitPrice: '25.00',
      lineTotal: '100.00'
    })
    expect(model.totals.due).toBe('125.00')
  })

  test('normalizes invoice line notes for detailed utility invoices', () => {
    const xml = readFileSync(join(import.meta.dirname, 'fixtures', 'tekniska-verken-invoice.xml'), 'utf8')
    const model = normalizeUblDocument(parseUblXml(xml))

    expect(model.lines[0].note).toContain('Period: 2026-05-01 - 2026-05-31')
    expect(model.lines[1].note).toContain('Mätare: 735999144013330979:P.s')
  })

  test('rejects documents that cannot produce a meaningful PDF', () => {
    const parsed = parseUblXml(`<?xml version="1.0"?>
      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
        <ID>INV-MISSING</ID>
      </Invoice>`)

    expect(() => normalizeUblDocument(parsed)).toThrow(/Missing required invoice fields/)
  })
})
