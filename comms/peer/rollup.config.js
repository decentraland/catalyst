/* eslint-disable @typescript-eslint/no-var-requires */
const json = require('rollup-plugin-json')

const allExternals = []

export default {
  external: allExternals,
  output: {
    name: 'bundle'
  },
  plugins: [json()]
}
