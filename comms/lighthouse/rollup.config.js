import commonjs from '@rollup/plugin-commonjs'
import npm from '@rollup/plugin-node-resolve'
import react from 'react'
import reactDom from 'react-dom'
import globals from 'rollup-plugin-node-globals'

/* eslint-disable @typescript-eslint/no-var-requires */
const json = require('rollup-plugin-json')

const allExternals = []

export default {
  external: allExternals,
  output: {
    name: 'bundle'
  },
  context: 'this',
  plugins: [
    json(),
    npm({ preferBuiltins: true, browser: true }),
    commonjs({
      browser: true,
      namedExports: {
        react: Object.keys(react),
        'react-dom': Object.keys(reactDom)
      }
    }),
    globals()
  ]
}
