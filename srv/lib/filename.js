function safePdfFilename(documentId) {
  const baseName = String(documentId || 'document')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)

  return `${baseName || 'document'}.pdf`
}

module.exports = {
  safePdfFilename
}
