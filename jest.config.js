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
