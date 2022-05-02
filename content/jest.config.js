module.exports = {
  coverageDirectory: 'coverage',
  coverageReporters: ['json'],
  collectCoverageFrom: ['./src/**/*.ts'],
  testEnvironment: 'node',
  testTimeout: 60000,
  verbose: true,
  projects: [
    {
      displayName: 'unit',
      globals: {
        'ts-jest': {
          tsconfig: '<rootDir>/test/tsconfig.json',
        }
      },
      testMatch: ['**/test/unit/**/*.spec.(ts)'],
      preset: 'ts-jest'
    },
    {
      displayName: 'integration',
      globals: {
        'ts-jest': {
          tsconfig: '<rootDir>/test/tsconfig.json'
        }
      },
      testMatch: ['**/test/integration/**/*.spec.(ts)'],
      globalSetup: './jest.globalSetup.ts',
      globalTeardown: './jest.globalTeardown.ts',
      setupFilesAfterEnv: ['./jest.setupFilesAfterEnv.ts'],
      preset: 'ts-jest'
    }
  ]
}
