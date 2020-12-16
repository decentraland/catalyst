import npm from '@rollup/plugin-node-resolve'
import ts from '@wessberg/rollup-plugin-ts'
import commonjs from '@rollup/plugin-commonjs'
import globals from 'rollup-plugin-node-globals'
import react from 'react'
import reactDom from 'react-dom'

/* eslint-disable @typescript-eslint/no-var-requires */
const json = require('rollup-plugin-json')

const allExternals = []

export default {
  external: allExternals,
  output: {
    name: 'bundle'
  },
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
    globals(),
    ,
    ts({})
  ]
}
