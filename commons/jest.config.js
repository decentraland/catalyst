module.exports = {
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['**/*.ts', '!dist/**', '!**/test/**', '!**/test-utils/**'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.(ts)'],
  verbose: true,
};
