import { describe, expect, test } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cds = require('@sap/cds')

describe('CAP project model', () => {
  test('can be loaded by CAP', async () => {
    const model = await cds.load('*')

    expect(model.definitions).toBeDefined()
  })
})
