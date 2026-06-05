const cds = require('@sap/cds')
const { registerInvoicePdfRoutes } = require('./srv/routes/invoice-pdf')

cds.on('bootstrap', app => {
  registerInvoicePdfRoutes(app)
})

module.exports = cds.server
