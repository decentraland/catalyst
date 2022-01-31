// This file was created just for testing purposes, mocking fs requires a third party lib like `mock-fs`
// Since files like the content migrator uses both fs and fs/promises mocking it made the test code too hard to read
// this adds no overhead and makes the test code simpler
export * from 'fs'
