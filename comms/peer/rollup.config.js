require('rollup-plugin-json')
import ts from '@wessberg/rollup-plugin-ts'

const allExternals = []

export default {
  external: allExternals,
  output: {
    name: 'bundle'
  },
  plugins: [json(), ts({})]
}
