module.exports = {
  coverageDirectory: 'coverage',
  coverageReporters: ['json'],
  collectCoverageFrom: ['./src/**/*.ts'],
  testEnvironment: 'node',
  testTimeout: 60000,
  verbose: true,
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", {tsconfig: "test/tsconfig.json"}]
  },
  projects: [
    {
      displayName: 'unit',
      testMatch: ['**/test/unit/**/*.spec.(ts)'],
      preset: 'ts-jest'
    },
    {
      displayName: 'integration',
      testMatch: ['**/test/integration/**/*.spec.(ts)'],
      globalSetup: './jest.globalSetup.ts',
      globalTeardown: './jest.globalTeardown.ts',
      setupFilesAfterEnv: ['./jest.setupFilesAfterEnv.ts'],
      preset: 'ts-jest'
    }
  ]
}
