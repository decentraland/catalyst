module.exports = {
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['./src/**/*.ts'],
  testEnvironment: 'node',
  testTimeout: 60000,
  verbose: true,
  projects: [{
    displayName: 'unit',
    testMatch: ['**/test/unit/**/*.spec.(ts)'],
    preset: 'ts-jest',
  }, {
    displayName: 'integration',
    testMatch: ['**/test/integration/**/*.spec.(ts)'],
    globalSetup: './jest.globalSetup.ts',
    globalTeardown: './jest.globalTeardown.ts',
    setupFilesAfterEnv: ['./jest.setupFilesAfterEnv.ts'],
    preset: 'ts-jest',
  }]
};
