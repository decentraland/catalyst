module.exports = {
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['**/*.ts', '!dist/**', '!**/test/**', '!**/test-utils/**'],
  preset: 'ts-jest',
  silent: true,
  testEnvironment: 'node',
  testMatch: ['**/*.spec.(ts)'],
  verbose: true,
};
