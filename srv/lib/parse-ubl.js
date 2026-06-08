const { XMLParser, XMLValidator } = require('fast-xml-parser')
const { BadRequestError } = require('./errors')

const UNSAFE_XML_PATTERN = /<!DOCTYPE|<!ENTITY/i
const SUPPORTED_ROOTS = new Set(['Invoice', 'CreditNote'])
const SBD_ROOT = 'StandardBusinessDocument'

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
  const unwrapped = unwrapSupportedDocument(parsed, rootName)

  if (unwrapped) {
    return unwrapped
  }

  if (!SUPPORTED_ROOTS.has(rootName)) {
    throw new BadRequestError(`Unsupported UBL document type: ${rootName || 'unknown'}`)
  }

  return {
    documentType: rootName,
    rootName,
    document: typeof parsed[rootName] === 'object' && parsed[rootName] !== null ? parsed[rootName] : {}
  }
}

function unwrapSupportedDocument(parsed, rootName) {
  if (SUPPORTED_ROOTS.has(rootName)) {
    return {
      documentType: rootName,
      rootName,
      document: typeof parsed[rootName] === 'object' && parsed[rootName] !== null ? parsed[rootName] : {}
    }
  }

  if (rootName !== SBD_ROOT) {
    return null
  }

  const wrapper = parsed[rootName]
  if (!wrapper || typeof wrapper !== 'object') {
    throw new BadRequestError('Unsupported UBL document type: unknown')
  }

  const nestedRootName = Object.keys(wrapper).find(
    key => key !== 'StandardBusinessDocumentHeader' && !key.startsWith('?')
  )

  if (!SUPPORTED_ROOTS.has(nestedRootName)) {
    throw new BadRequestError(`Unsupported UBL document type: ${nestedRootName || 'unknown'}`)
  }

  return {
    documentType: nestedRootName,
    rootName: nestedRootName,
    document:
      typeof wrapper[nestedRootName] === 'object' && wrapper[nestedRootName] !== null
        ? wrapper[nestedRootName]
        : {}
  }
}

module.exports = {
  parseUblXml
}
