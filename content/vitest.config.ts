import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    globalSetup: ['./jest.globalSetup.ts'],
    typecheck: {
      tsconfig: './test/tsconfig.json'
    }
  }
})
