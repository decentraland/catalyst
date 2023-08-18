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
  testMatch: ['**/test/unit/**/*.spec.(ts)', '**/test/integration/**/*.spec.(ts)'],
  globalSetup: './jest.globalSetup.ts',
  globalTeardown: './jest.globalTeardown.ts',
  setupFilesAfterEnv: ['./jest.setupFilesAfterEnv.ts'],
  preset: 'ts-jest'
}
