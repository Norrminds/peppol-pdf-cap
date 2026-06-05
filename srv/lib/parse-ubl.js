const { XMLParser, XMLValidator } = require('fast-xml-parser')
const { BadRequestError } = require('./errors')

const UNSAFE_XML_PATTERN = /<!DOCTYPE|<!ENTITY/i
const SUPPORTED_ROOTS = new Set(['Invoice', 'CreditNote'])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
  ignoreDeclaration: true
})

function parseUblXml(xml) {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new BadRequestError('Request body must contain XML')
  }

  if (UNSAFE_XML_PATTERN.test(xml)) {
    throw new BadRequestError('DTD and entity declarations are not supported')
  }

  const validation = XMLValidator.validate(xml)
  if (validation !== true) {
    throw new BadRequestError('Invalid XML', validation.err)
  }

  let parsed
  try {
    parsed = parser.parse(xml)
  } catch (error) {
    throw new BadRequestError('Invalid XML', { message: error.message })
  }

  const rootName = Object.keys(parsed || {}).find(key => !key.startsWith('?'))
  if (!SUPPORTED_ROOTS.has(rootName)) {
    throw new BadRequestError(`Unsupported UBL document type: ${rootName || 'unknown'}`)
  }

  return {
    documentType: rootName,
    rootName,
    document: typeof parsed[rootName] === 'object' && parsed[rootName] !== null ? parsed[rootName] : {}
  }
}

module.exports = {
  parseUblXml
}
