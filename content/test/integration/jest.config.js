module.exports = {
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.ts"],
  globalSetup: "./jest.globalSetup.ts",
  globalTeardown: "./jest.globalTeardown.ts",
  preset: 'ts-jest',
  rootDir: '../../',
  setupFilesAfterEnv: ["./jest.setupFilesAfterEnv.ts"],
  silent: true,
  testEnvironment: "node",
  testMatch: ["**/*.spec.(ts)"],
  testTimeout: 60000,
  verbose: true
};
