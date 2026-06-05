import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import parserModule from '../srv/lib/parse-ubl.js'

const { parseUblXml } = parserModule

function fixture(name) {
  return readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')
}

describe('parseUblXml', () => {
  test('detects UBL Invoice documents', () => {
    const result = parseUblXml(fixture('invoice.xml'))

    expect(result.documentType).toBe('Invoice')
    expect(result.rootName).toBe('Invoice')
    expect(result.document.ID).toBe('INV-1000')
  })

  test('detects UBL CreditNote documents', () => {
    const result = parseUblXml(fixture('credit-note.xml'))

    expect(result.documentType).toBe('CreditNote')
    expect(result.rootName).toBe('CreditNote')
    expect(result.document.ID).toBe('CN-1000')
  })

  test('rejects malformed XML', () => {
    expect(() => parseUblXml('<Invoice><cbc:ID>broken</Invoice>')).toThrow(/Invalid XML/)
  })

  test('rejects unsupported XML roots', () => {
    expect(() => parseUblXml('<Order><ID>1</ID></Order>')).toThrow(/Unsupported UBL document type/)
  })

  test('rejects DTD and entity declarations', () => {
    const xml = '<!DOCTYPE Invoice [<!ENTITY ext SYSTEM "file:///etc/passwd">]><Invoice>&ext;</Invoice>'

    expect(() => parseUblXml(xml)).toThrow(/DTD and entity declarations are not supported/)
  })
})
