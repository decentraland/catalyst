module.exports = {
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.(ts)'],
  verbose: true,
};
