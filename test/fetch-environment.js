const NodeEnvironment = require('jest-environment-node').default || require('jest-environment-node')

// Jest 27's sandboxed `node` test environment does not expose the Web platform globals that Node 24
// provides in production. Production code now relies on the native global `fetch` (via
// `@dcl/fetch-component`), and its companion classes, so copy them from the host realm into the
// sandbox. Without this, any test exercising the fetch path fails with `fetch is not defined`.
const HOST_GLOBALS = [
  'fetch',
  'Headers',
  'Request',
  'Response',
  'FormData',
  'Blob',
  'File',
  'ReadableStream',
  'WritableStream',
  'TransformStream'
]

class FetchTestEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup()
    for (const name of HOST_GLOBALS) {
      if (this.global[name] === undefined && globalThis[name] !== undefined) {
        this.global[name] = globalThis[name]
      }
    }
  }
}

module.exports = FetchTestEnvironment
