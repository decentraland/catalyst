/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  globalSetup: './jest.globalSetup.ts',
  globalTeardown: './jest.globalTeardown.ts',
  preset: 'ts-jest',
  setupFilesAfterEnv: ['./jest.setupFilesAfterEnv.ts'],
  silent: true,
  testEnvironment: 'node',
  testMatch: ["**/*.spec.(ts)"],
  testTimeout: 60000,
  verbose: true,
};
