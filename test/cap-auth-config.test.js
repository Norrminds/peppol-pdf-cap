import { describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'

describe('CAP auth configuration', () => {
  test('uses dummy auth in production so BTP does not require XSUAA', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        [
          "process.env.NODE_ENV = 'production'",
          "const cds = require('@sap/cds')",
          "console.log(JSON.stringify(cds.env.requires.auth))"
        ].join(';')
      ],
      {
        cwd: new URL('..', import.meta.url),
        encoding: 'utf8'
      }
    )

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ kind: 'dummy' })
  })
})
