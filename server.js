const express = require('express')
const { registerInvoicePdfRoutes } = require('./srv/routes/invoice-pdf')

const app = express()
registerInvoicePdfRoutes(app)

const port = process.env.PORT || 4004

// Force exit if connections do not drain in time. Kept below Cloud Foundry's
// ~10s SIGKILL grace so we exit cleanly first.
const SHUTDOWN_TIMEOUT_MS = 8000

if (require.main === module) {
  const server = app.listen(port, () => {
    console.log(`peppol-pdf listening on port ${port}`)
  })

  const shutdown = signal => {
    console.log(`${signal} received, draining connections`)
    server.close(() => {
      console.log('http server closed, exiting')
      process.exit(0)
    })
    setTimeout(() => {
      console.error('shutdown timed out, forcing exit')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

module.exports = app
