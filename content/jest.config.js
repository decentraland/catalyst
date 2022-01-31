module.exports = {
  coverageDirectory: 'coverage',
  coverageReporters: ['json'],
  collectCoverageFrom: ['./src/**/*.ts'],
  testEnvironment: 'node',
  testTimeout: 60000,
  verbose: true,
  projects: [
    {
      globals: {
        'ts-jest': {
          tsconfig: 'test/tsconfig.json'
        }
      },
      displayName: 'unit',
      testMatch: ['**/test/unit/**/*.spec.(ts)'],
      preset: 'ts-jest'
    },
    {
      globals: {
        'ts-jest': {
          tsconfig: 'test/tsconfig.json'
        }
      },
      displayName: 'integration',
      testMatch: ['**/test/integration/**/*.spec.(ts)'],
      globalSetup: './jest.globalSetup.ts',
      globalTeardown: './jest.globalTeardown.ts',
      setupFilesAfterEnv: ['./jest.setupFilesAfterEnv.ts'],
      preset: 'ts-jest'
    }
  ]
}
