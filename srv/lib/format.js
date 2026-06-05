function asArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function compact(values) {
  return values
    .map(value => toText(value))
    .filter(value => value !== '')
}

function joinDistinct(values, separator = ' ') {
  return [...new Set(compact(values))].join(separator)
}

function toText(value) {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return compact(value).join(', ')
  if (typeof value === 'object') return toText(value['#text'])
  return String(value).trim()
}

function at(object, path) {
  return path.split('.').reduce((current, key) => {
    if (current === undefined || current === null) return undefined
    return current[key]
  }, object)
}

function textAt(object, path, fallback = '') {
  const value = toText(at(object, path))
  return value || fallback
}

function firstText(object, paths, fallback = '') {
  for (const path of paths) {
    const value = textAt(object, path)
    if (value) return value
  }
  return fallback
}

function amountText(value) {
  return toText(value)
}

module.exports = {
  asArray,
  compact,
  joinDistinct,
  toText,
  at,
  textAt,
  firstText,
  amountText
}
