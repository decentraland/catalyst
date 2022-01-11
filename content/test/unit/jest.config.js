module.exports = {
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.ts"],
  preset: 'ts-jest',
  rootDir: '../../',
  silent: true,
  testEnvironment: 'node',
  testMatch: ["**/*.spec.(ts)"],
  verbose: true,
};
