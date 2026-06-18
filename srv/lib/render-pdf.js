const PdfPrinter = require('pdfmake')

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
}

const colors = {
  paper: '#f7f4ef',
  ink: '#263033',
  muted: '#68777d',
  accent: '#526f7f',
  accentSoft: '#e6edf0',
  rule: '#cfd8dc',
  totalBg: '#eef1ed'
}

async function renderInvoicePdf(model, generatedAt = new Date()) {
  const printer = new PdfPrinter(fonts)
  const pdfDoc = printer.createPdfKitDocument(buildInvoiceDocDefinition(model, generatedAt))

  return new Promise((resolve, reject) => {
    const chunks = []
    pdfDoc.on('data', chunk => chunks.push(chunk))
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
    pdfDoc.on('error', reject)
    pdfDoc.end()
  })
}

function buildInvoiceDocDefinition(model, generatedAt = new Date()) {
  return {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 54],
    background: (_currentPage, pageSize) => ({
      canvas: [
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: pageSize.width,
          h: pageSize.height,
          color: colors.paper
        }
      ]
    }),
    footer: (currentPage, pageCount) => ({
      margin: [36, 0, 36, 24],
      columns: [
        {
          text: `Generated ${generatedAt.toISOString()}`,
          color: colors.muted,
          fontSize: 7
        },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          alignment: 'right',
          color: colors.muted,
          fontSize: 7
        }
      ]
    }),
    defaultStyle: {
      font: 'Helvetica',
      fontSize: 9,
      color: colors.ink,
      lineHeight: 1.18
    },
    styles: styles(),
    content: [
      headerBlock(model),
      partyBlock(model),
      referenceAndPaymentBlock(model),
      lineItemsTable(model),
      totalsBlock(model),
      notesBlock(model)
    ].filter(Boolean)
  }
}

function styles() {
  return {
    eyebrow: {
      fontSize: 8,
      bold: true,
      color: colors.accent,
      characterSpacing: 0.8
    },
    title: {
      fontSize: 28,
      bold: true,
      color: colors.ink
    },
    documentId: {
      fontSize: 11,
      color: colors.muted
    },
    sectionLabel: {
      fontSize: 8,
      bold: true,
      color: colors.accent,
      margin: [0, 0, 0, 6]
    },
    partyName: {
      fontSize: 11,
      bold: true,
      margin: [0, 0, 0, 4]
    },
    smallMuted: {
      fontSize: 7.5,
      color: colors.muted
    },
    tableHeader: {
      bold: true,
      fillColor: colors.accentSoft,
      color: colors.ink,
      fontSize: 7.5
    },
    amountDueLabel: {
      fontSize: 8,
      bold: true,
      color: colors.accent
    },
    amountDue: {
      fontSize: 20,
      bold: true,
      color: colors.ink
    }
  }
}

function headerBlock(model) {
  return {
    margin: [0, 0, 0, 22],
    columns: [
      {
        width: '*',
        stack: [
          { text: model.title, style: 'title' },
          { text: model.id, style: 'documentId', margin: [1, 2, 0, 0] }
        ]
      },
      {
        width: 190,
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  { text: 'Amount due', style: 'amountDueLabel' },
                  { text: money(model.totals.due, model.currency), style: 'amountDue', margin: [0, 3, 0, 8] },
                  keyValueLine('Issue date', model.issueDate),
                  keyValueLine('Due date', model.dueDate || 'n/a'),
                  keyValueLine('Currency', model.currency)
                ],
                margin: [12, 10, 12, 10],
                fillColor: colors.totalBg
              }
            ]
          ]
        },
        layout: softBoxLayout()
      }
    ]
  }
}

function partyBlock(model) {
  return {
    margin: [0, 0, 0, 16],
    columns: [
      partyPanel('Supplier', model.supplier),
      { width: 14, text: '' },
      partyPanel('Customer', model.customer)
    ]
  }
}

function partyPanel(label, party) {
  return {
    width: '*',
    table: {
      widths: ['*'],
      body: [
        [
          {
            margin: [10, 9, 10, 10],
            stack: [
              { text: label, style: 'sectionLabel' },
              { text: party.name || 'n/a', style: 'partyName' },
              ...party.addressLines.map(line => ({ text: line })),
              ...partyIdentifiers(party),
              ...contactLines(party)
            ]
          }
        ]
      ]
    },
    layout: softBoxLayout()
  }
}

function partyIdentifiers(party) {
  const lines = []
  if (party.vatId) lines.push({ text: `VAT: ${party.vatId}`, margin: [0, 5, 0, 0], style: 'smallMuted' })
  for (const identifier of party.identifiers || []) {
    const prefix = identifier.scheme ? `${identifier.scheme}: ` : ''
    lines.push({ text: `${prefix}${identifier.value}`, style: 'smallMuted' })
  }
  return lines
}

function contactLines(party) {
  const lines = []
  const contact = party.contact || {}
  if (contact.name) lines.push({ text: contact.name, margin: [0, 5, 0, 0], style: 'smallMuted' })
  if (contact.phone) lines.push({ text: contact.phone, style: 'smallMuted' })
  if (contact.email) lines.push({ text: contact.email, style: 'smallMuted' })
  return lines
}

function referenceAndPaymentBlock(model) {
  const referenceRows = [
    ...model.references.map(reference => [smallLabel(reference.label), smallValue(reference.value)]),
    ...(model.payment.paymentId ? [[smallLabel('Payment ID'), smallValue(model.payment.paymentId)]] : []),
    ...(model.payment.iban ? [[smallLabel('IBAN'), smallValue(model.payment.iban)]] : []),
    ...(model.payment.bic ? [[smallLabel('BIC'), smallValue(model.payment.bic)]] : []),
    ...(model.payment.terms ? [[smallLabel('Payment terms'), smallValue(model.payment.terms)]] : [])
  ]

  if (referenceRows.length === 0) return null

  return {
    margin: [0, 0, 0, 18],
    table: {
      widths: [100, '*'],
      body: referenceRows
    },
    layout: {
      hLineWidth: i => (i === 0 || i === referenceRows.length ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => colors.rule,
      paddingLeft: () => 0,
      paddingRight: () => 8,
      paddingTop: () => 4,
      paddingBottom: () => 4
    }
  }
}

function lineItemsTable(model) {
  const body = [
    [
      tableHeader('Description'),
      tableHeader('Qty', 'right'),
      tableHeader('Unit', 'right'),
      tableHeader('Price', 'right'),
      tableHeader('VAT', 'right'),
      tableHeader('Line total', 'right')
    ],
    ...model.lines.map(line => [
      lineDescriptionCell(line),
      right(line.quantity),
      right(line.unitCode),
      right(money(line.unitPrice, model.currency)),
      right(vatText(line)),
      right(money(line.lineTotal, model.currency))
    ])
  ]

  return {
    margin: [0, 0, 0, 18],
    table: {
      headerRows: 1,
      widths: ['*', 42, 38, 58, 44, 68],
      body
    },
    layout: {
      hLineWidth: i => (i === 0 || i === 1 || i === body.length ? 0.8 : 0.35),
      vLineWidth: () => 0,
      hLineColor: () => colors.rule,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5
    }
  }
}

function lineDescriptionCell(line) {
  const description = line.description || `Line ${line.id || ''}`.trim()
  const stack = [{ text: description || 'n/a' }]

  if (line.note) {
    stack.push({
      text: line.note,
      color: colors.muted,
      fontSize: 7.4,
      margin: [0, 2, 0, 0]
    })
  }

  return {
    stack,
    margin: [0, 3, 0, 3]
  }
}

function totalsBlock(model) {
  return {
    columns: [
      taxSummary(model),
      { width: 20, text: '' },
      totalsSummary(model)
    ],
    margin: [0, 0, 0, 16]
  }
}

function taxSummary(model) {
  const rows = [
    [tableHeader('VAT'), tableHeader('Rate'), tableHeader('Base', 'right'), tableHeader('Tax', 'right')],
    ...model.taxSubtotals.map(tax => [
      tax.category || 'n/a',
      tax.percent ? `${tax.percent}%` : 'n/a',
      right(money(tax.taxableAmount, model.currency)),
      right(money(tax.taxAmount, model.currency))
    ])
  ]

  return {
    width: '*',
    stack: [
      { text: 'VAT summary', style: 'sectionLabel' },
      {
        table: {
          headerRows: 1,
          widths: [38, 42, '*', '*'],
          body: rows
        },
        layout: quietTableLayout()
      }
    ]
  }
}

function totalsSummary(model) {
  const rows = [
    [smallLabel('Net amount'), right(money(model.totals.net, model.currency))],
    [smallLabel('VAT amount'), right(money(model.totals.tax, model.currency))],
    [smallLabel('Gross amount'), right(money(model.totals.gross, model.currency))]
  ]

  if (model.totals.prepaid) rows.push([smallLabel('Prepaid'), right(money(model.totals.prepaid, model.currency))])
  if (model.totals.rounding) rows.push([smallLabel('Rounding'), right(money(model.totals.rounding, model.currency))])

  rows.push([
    { text: 'Amount due', bold: true, color: colors.ink, margin: [0, 5, 0, 0] },
    { text: money(model.totals.due, model.currency), bold: true, alignment: 'right', margin: [0, 5, 0, 0] }
  ])

  return {
    width: 210,
    table: {
      widths: ['*', 88],
      body: rows
    },
    layout: {
      hLineWidth: i => (i === rows.length - 1 ? 0.8 : 0),
      vLineWidth: () => 0,
      hLineColor: () => colors.accent,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 4,
      paddingBottom: () => 4
    }
  }
}

function notesBlock(model) {
  const notes = [...(model.notes || [])]
  if (model.payment.terms && !notes.includes(model.payment.terms)) notes.push(model.payment.terms)
  if (notes.length === 0) return null

  return {
    margin: [0, 6, 0, 0],
    stack: [
      { text: 'Notes', style: 'sectionLabel' },
      ...notes.map(note => ({ text: note, color: colors.muted, fontSize: 8 }))
    ]
  }
}

function keyValueLine(label, value) {
  return {
    columns: [
      { text: label, color: colors.muted, fontSize: 8 },
      { text: value || 'n/a', alignment: 'right', fontSize: 8, bold: true }
    ],
    margin: [0, 1, 0, 1]
  }
}

function smallLabel(text) {
  return { text, color: colors.muted, fontSize: 8 }
}

function smallValue(text) {
  return { text: text || 'n/a', fontSize: 8.5 }
}

function tableHeader(text, alignment) {
  return { text, style: 'tableHeader', alignment, margin: [0, 2, 0, 2] }
}

function right(text) {
  return { text: text || 'n/a', alignment: 'right', margin: [0, 3, 0, 3] }
}

function money(value, currency) {
  if (!value) return 'n/a'

  const formatted = formatAmount(value)
  return currency ? `${formatted} ${currency}` : formatted
}

function formatAmount(value) {
  const normalized = String(value).trim().replace(/\s+/g, '')
  if (!normalized) return String(value)

  const match = normalized.match(/^([+-]?)(\d+)([.,](\d+))?$/)
  if (!match) return String(value)

  const [, sign, integerPart, , decimalPart = ''] = match
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fraction = decimalPart ? `.${decimalPart}` : ''
  return `${sign}${groupedInteger}${fraction}`
}

function vatText(line) {
  const rate = line.taxPercent ? `${line.taxPercent}%` : ''
  return [line.taxCategory, rate].filter(Boolean).join(' ')
}

function softBoxLayout() {
  return {
    hLineWidth: () => 0.6,
    vLineWidth: () => 0.6,
    hLineColor: () => colors.rule,
    vLineColor: () => colors.rule,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0
  }
}

function quietTableLayout() {
  return {
    hLineWidth: i => (i === 0 || i === 1 ? 0.7 : 0.35),
    vLineWidth: () => 0,
    hLineColor: () => colors.rule,
    paddingLeft: () => 5,
    paddingRight: () => 5,
    paddingTop: () => 4,
    paddingBottom: () => 4
  }
}

module.exports = {
  buildInvoiceDocDefinition,
  renderInvoicePdf
}
