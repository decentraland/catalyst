module.exports = {
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  preset: 'ts-jest',
  silent: true,
  testEnvironment: 'node',
  testMatch: ['**/*.spec.(ts)'],
  verbose: true,
};
