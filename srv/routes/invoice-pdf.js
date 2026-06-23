const crypto = require('node:crypto')
const express = require('express')
const { AppError, PayloadTooLargeError, UnauthorizedError, errorResponse } = require('../lib/errors')
const { safePdfFilename } = require('../lib/filename')
const { normalizeUblDocument } = require('../lib/normalize-invoice')
const { parseUblXml } = require('../lib/parse-ubl')
const { renderInvoicePdf } = require('../lib/render-pdf')

function registerInvoicePdfRoutes(app) {
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'peppol-pdf'
    })
  })

  app.post('/invoice-pdf', requireApiKey, readXmlBody, async (req, res) => {
    const xml = req.body.toString('utf8')
    const parsed = parseUblXml(xml)
    const model = normalizeUblDocument(parsed)
    const pdf = await renderInvoicePdf(model)
    const filename = safePdfFilename(model.id)

    res.status(200)
    res.set('Content-Type', 'application/pdf')
    res.set('Content-Disposition', `inline; filename="${filename}"`)
    res.send(pdf)
  })

  // Final error handler. Express 5 forwards rejected promises from the async
  // route handler here automatically, so the handler needs no try/catch.
  app.use((error, _req, res, _next) => {
    sendError(res, error)
  })
}

// Read the raw request body into a Buffer. The size limit is resolved per
// request so XML_BODY_LIMIT can be changed (and overridden in tests) without
// re-creating the parser at module load. `type: '*/*'` accepts any content
// type, since callers post application/xml.
function readXmlBody(req, res, next) {
  const parser = express.raw({
    type: '*/*',
    limit: process.env.XML_BODY_LIMIT || '5mb'
  })

  parser(req, res, error => {
    if (!error) return next()

    if (error.type === 'entity.too.large' || error.status === 413 || error.statusCode === 413) {
      return next(new PayloadTooLargeError())
    }

    next(error)
  })
}

function requireApiKey(req, _res, next) {
  const expected = process.env.PDF_API_KEY
  if (!expected) return next()

  const actual = req.get('x-api-key') || ''
  if (!safeEquals(actual, expected)) {
    return next(new UnauthorizedError())
  }

  next()
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
