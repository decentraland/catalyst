const sharedIgnorePatterns = ['/node_modules/', '/dist/', '/.claude/', '/.agents/']

module.exports = {
  coverageDirectory: 'coverage',
  coverageReporters: ['json'],
  collectCoverageFrom: ['./src/**/*.ts'],
  testEnvironment: 'node',
  testTimeout: 60000,
  verbose: true,
  // Mock ESM-only packages that Jest cannot transform
  moduleNameMapper: {
    '^file-type$': '<rootDir>/__mocks__/file-type.ts'
  },
  projects: [
    {
      displayName: 'unit',
      globals: {
        'ts-jest': {
          tsconfig: '<rootDir>/test/tsconfig.json'
        }
      },
      testMatch: ['<rootDir>/test/unit/**/*.spec.(ts)'],
      testPathIgnorePatterns: sharedIgnorePatterns,
      preset: 'ts-jest',
      moduleNameMapper: {
        '^file-type$': '<rootDir>/__mocks__/file-type.ts'
      }
    },
    {
      displayName: 'integration',
      // Multi-server sync suites (e.g. failed-deployments) start two full programs and wait for
      // bootstrap in a `beforeEach`; under the cumulative load of the whole integration run that
      // setup can exceed the default 60s even though it finishes in seconds in isolation. Give the
      // heavier integration suite more headroom.
      testTimeout: 120000,
      globals: {
        'ts-jest': {
          tsconfig: '<rootDir>/test/tsconfig.json'
        }
      },
      testEnvironment: '<rootDir>/test/fetch-environment.js',
      testMatch: ['<rootDir>/test/integration/**/*.spec.(ts)'],
      testPathIgnorePatterns: sharedIgnorePatterns,
      globalSetup: './jest.globalSetup.ts',
      globalTeardown: './jest.globalTeardown.ts',
      setupFilesAfterEnv: ['./jest.setupFilesAfterEnv.ts'],
      preset: 'ts-jest',
      moduleNameMapper: {
        '^file-type$': '<rootDir>/__mocks__/file-type.ts'
      }
    }
  ]
}
