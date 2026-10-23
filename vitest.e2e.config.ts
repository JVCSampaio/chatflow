import { defineConfig } from 'vitest/config'

// Testes de ponta a ponta: navegador real contra o servidor já em execução (CHATFLOW_URL).
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    reporters: ['default', 'junit'],
    outputFile: { junit: 'reports/e2e-junit.xml' },
  },
})
