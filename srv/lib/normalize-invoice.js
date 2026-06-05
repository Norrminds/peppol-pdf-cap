const { BadRequestError } = require('./errors')
const { asArray, compact, firstText, joinDistinct, textAt, toText } = require('./format')

function normalizeUblDocument(parsed) {
  const root = parsed?.document || {}
  const isCreditNote = parsed?.documentType === 'CreditNote'

  const model = {
    type: isCreditNote ? 'credit-note' : 'invoice',
    title: isCreditNote ? 'Credit Note' : 'Invoice',
    id: textAt(root, 'ID'),
    issueDate: textAt(root, 'IssueDate'),
    dueDate: textAt(root, 'DueDate'),
    currency: textAt(root, 'DocumentCurrencyCode'),
    supplier: normalizeParty(root.AccountingSupplierParty?.Party),
    customer: normalizeParty(root.AccountingCustomerParty?.Party),
    references: normalizeReferences(root),
    payment: normalizePayment(root),
    notes: compact(asArray(root.Note)),
    lines: normalizeLines(isCreditNote, root),
    taxSubtotals: normalizeTaxSubtotals(root),
    totals: normalizeTotals(root)
  }

  const missing = []
  if (!model.id) missing.push('document ID')
  if (!model.currency) missing.push('currency')
  if (!model.supplier.name) missing.push('supplier name')
  if (!model.customer.name) missing.push('customer name')
  if (!model.totals.due) missing.push('amount due')

  if (missing.length > 0) {
    throw new BadRequestError('Missing required invoice fields', { missing })
  }

  return model
}

function normalizeParty(party = {}) {
  const partyTaxSchemes = asArray(party.PartyTaxScheme)
  const vatScheme = partyTaxSchemes.find(scheme => textAt(scheme, 'TaxScheme.ID').toUpperCase() === 'VAT')
  const taxScheme = vatScheme || partyTaxSchemes[0] || {}

  return {
    name: firstText(party, [
      'PartyLegalEntity.RegistrationName',
      'PartyName.Name',
      'Name'
    ]),
    identifiers: normalizeIdentifiers(party),
    vatId: textAt(taxScheme, 'CompanyID'),
    addressLines: normalizeAddress(party.PostalAddress),
    contact: {
      name: textAt(party, 'Contact.Name'),
      phone: textAt(party, 'Contact.Telephone'),
      email: textAt(party, 'Contact.ElectronicMail')
    }
  }
}

function normalizeIdentifiers(party) {
  const identifiers = []
  addIdentifier(identifiers, party.EndpointID)

  for (const partyId of asArray(party.PartyIdentification)) {
    addIdentifier(identifiers, partyId.ID)
  }

  return identifiers
}

function addIdentifier(identifiers, node) {
  const value = toText(node)
  if (!value) return

  const scheme = node && typeof node === 'object' ? toText(node['@_schemeID']) : ''
  const duplicate = identifiers.some(identifier => identifier.value === value && identifier.scheme === scheme)
  if (!duplicate) identifiers.push({ scheme, value })
}

function normalizeAddress(address = {}) {
  const cityLine = joinDistinct([textAt(address, 'PostalZone'), textAt(address, 'CityName')])
  return compact([
    textAt(address, 'StreetName'),
    textAt(address, 'AdditionalStreetName'),
    cityLine,
    textAt(address, 'Country.IdentificationCode')
  ])
}

function normalizeReferences(root) {
  return [
    { label: 'Buyer reference', value: textAt(root, 'BuyerReference') },
    { label: 'Order reference', value: textAt(root, 'OrderReference.ID') },
    { label: 'Contract reference', value: textAt(root, 'ContractDocumentReference.ID') },
    { label: 'Accounting cost', value: textAt(root, 'AccountingCost') }
  ].filter(reference => reference.value)
}

function normalizePayment(root) {
  const paymentMeans = asArray(root.PaymentMeans)[0] || {}
  const account = paymentMeans.PayeeFinancialAccount || {}

  return {
    meansCode: textAt(paymentMeans, 'PaymentMeansCode'),
    paymentId: textAt(paymentMeans, 'PaymentID'),
    iban: textAt(account, 'ID'),
    bic: firstText(account, [
      'FinancialInstitutionBranch.ID',
      'FinancialInstitutionBranch.FinancialInstitution.ID'
    ]),
    terms: compact(asArray(root.PaymentTerms).map(term => textAt(term, 'Note'))).join('\n')
  }
}

function normalizeLines(isCreditNote, root) {
  const lineNodes = asArray(isCreditNote ? root.CreditNoteLine : root.InvoiceLine)
  const quantityName = isCreditNote ? 'CreditedQuantity' : 'InvoicedQuantity'

  return lineNodes.map(line => {
    const quantity = line[quantityName]
    const item = line.Item || {}
    const tax = item.ClassifiedTaxCategory || {}

    return {
      id: textAt(line, 'ID'),
      description: joinDistinct([
        textAt(item, 'Name'),
        toText(item.Description)
      ], ' - '),
      quantity: toText(quantity),
      unitCode: quantity && typeof quantity === 'object' ? toText(quantity['@_unitCode']) : '',
      unitPrice: textAt(line, 'Price.PriceAmount'),
      taxCategory: textAt(tax, 'ID'),
      taxPercent: textAt(tax, 'Percent'),
      lineTotal: textAt(line, 'LineExtensionAmount')
    }
  })
}

function normalizeTaxSubtotals(root) {
  return asArray(root.TaxTotal).flatMap(taxTotal =>
    asArray(taxTotal.TaxSubtotal).map(subtotal => ({
      category: textAt(subtotal, 'TaxCategory.ID'),
      percent: textAt(subtotal, 'TaxCategory.Percent'),
      taxableAmount: textAt(subtotal, 'TaxableAmount'),
      taxAmount: textAt(subtotal, 'TaxAmount')
    }))
  )
}

function normalizeTotals(root) {
  const legalTotal = root.LegalMonetaryTotal || {}
  const taxTotal = asArray(root.TaxTotal)[0] || {}

  return {
    net: firstText(legalTotal, ['TaxExclusiveAmount', 'LineExtensionAmount']),
    tax: textAt(taxTotal, 'TaxAmount'),
    gross: textAt(legalTotal, 'TaxInclusiveAmount'),
    prepaid: textAt(legalTotal, 'PrepaidAmount'),
    rounding: textAt(legalTotal, 'PayableRoundingAmount'),
    due: textAt(legalTotal, 'PayableAmount')
  }
}

module.exports = {
  normalizeUblDocument,
  normalizeParty,
  normalizeLines,
  normalizeTaxSubtotals,
  normalizeTotals
}
