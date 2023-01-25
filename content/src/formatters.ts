/*
    This file is part of web3.js.

    web3.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    web3.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/

import * as utils from 'eth-connect'

/**
 * Returns true if the provided blockNumber is 'latest', 'pending' or 'earliest
 *
 * @param blockNumber - The given blocknumber
 */
export function isPredefinedBlockNumber(blockNumber: utils.Quantity | utils.Tag): blockNumber is utils.Tag {
  return blockNumber === 'latest' || blockNumber === 'pending' || blockNumber === 'earliest'
}

export function inputBlockNumberFormatter(blockNumber: utils.Quantity | utils.Tag | null): string | null {
  if (blockNumber === undefined || blockNumber == null) {
    return null
  } else if (isPredefinedBlockNumber(blockNumber)) {
    return blockNumber
  }
  return utils.toHex(blockNumber)
}

/**
 * Formats the input of a transaction and converts all values to HEX
 */
export function inputCallFormatter(options: utils.TransactionOptions) {
  options.from = options.from

  if (options.from) {
    options.from = inputAddressFormatter(options.from)
  }

  if (options.to) {
    // it might be contract creation
    options.to = inputAddressFormatter(options.to)
  }

  if (options.gasPrice !== undefined) options.gasPrice = utils.fromDecimal(options.gasPrice)
  if (options.gas !== undefined) options.gas = utils.fromDecimal(options.gas)
  if (options.value !== undefined) options.value = utils.fromDecimal(options.value)
  if (options.nonce !== undefined) options.nonce = utils.fromDecimal(options.nonce)

  if (options.data && !options.data.startsWith('0x') && /^[A-Za-z0-9]+$/.test(options.data)) {
    options.data = '0x' + options.data
  }

  return options
}

export function inputAddressFormatter(address: string) {
  if (utils.isStrictAddress(address)) {
    return address
  } else if (utils.isAddress(address)) {
    return '0x' + address
  }
  throw new Error(`Invalid address: ${JSON.stringify(address)}`)
}
