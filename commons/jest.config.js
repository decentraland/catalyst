/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  silent: true,
  testEnvironment: 'node',
  testMatch: ["**/*.spec.(ts)"],
  verbose: true,
};
