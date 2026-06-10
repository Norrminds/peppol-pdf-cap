const express = require('express')
const { registerInvoicePdfRoutes } = require('./srv/routes/invoice-pdf')

const app = express()
registerInvoicePdfRoutes(app)

const port = process.env.PORT || 4004

if (require.main === module) {
  app.listen(port, () => {
    console.log(`peppol-pdf listening on port ${port}`)
  })
}

module.exports = app
