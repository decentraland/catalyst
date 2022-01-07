/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  setupFilesAfterEnv: ['./jest.setupFilesAfterEnv.ts'],
  silent: true,
  testEnvironment: 'node',
  testMatch: ["**/*.spec.(ts)"],
  verbose: true,
};
