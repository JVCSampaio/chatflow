import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/apoio/mongo-global.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'reports/vitest-junit.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // server.ts só conecta as peças e sobe o processo; é exercitado pelos testes de ponta a ponta.
      exclude: ['src/server.ts'],
      reporter: ['text-summary', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'reports/cobertura',
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
})
