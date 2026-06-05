const crypto = require('node:crypto')
const getRawBody = require('raw-body')
const { AppError, PayloadTooLargeError, UnauthorizedError, errorResponse } = require('../lib/errors')
const { safePdfFilename } = require('../lib/filename')
const { normalizeUblDocument } = require('../lib/normalize-invoice')
const { parseUblXml } = require('../lib/parse-ubl')
const { renderInvoicePdf } = require('../lib/render-pdf')

function registerInvoicePdfRoutes(app) {
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'peppol-pdf-cap'
    })
  })

  app.post('/invoice-pdf', async (req, res) => {
    try {
      requireApiKey(req)

      const xml = await readRawXml(req)
      const parsed = parseUblXml(xml)
      const model = normalizeUblDocument(parsed)
      const pdf = await renderInvoicePdf(model)
      const filename = safePdfFilename(model.id)

      res.status(200)
      res.set('Content-Type', 'application/pdf')
      res.set('Content-Disposition', `inline; filename="${filename}"`)
      res.send(pdf)
    } catch (error) {
      sendError(res, error)
    }
  })
}

async function readRawXml(req) {
  try {
    return await getRawBody(req, {
      encoding: 'utf8',
      limit: process.env.XML_BODY_LIMIT || '5mb'
    })
  } catch (error) {
    if (error.type === 'entity.too.large' || error.statusCode === 413) {
      throw new PayloadTooLargeError()
    }

    throw error
  }
}

function requireApiKey(req) {
  const expected = process.env.PDF_API_KEY
  if (!expected) return

  const actual = req.get('x-api-key') || ''
  if (!safeEquals(actual, expected)) {
    throw new UnauthorizedError()
  }
}

function safeEquals(actual, expected) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) return false
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

function sendError(res, error) {
  if (error instanceof AppError) {
    res.status(error.status).json(errorResponse(error))
    return
  }

  console.error(error)
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Unexpected PDF rendering failure'
    }
  })
}

module.exports = {
  registerInvoicePdfRoutes
}
