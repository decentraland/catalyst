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

import * as utils from "eth-connect"
// import * as utils from '../utils/utils'
// import * as config from '../utils/config'
// import {
//   BlockObject,
//   FilterOptions,
//   LogObject,
//   Quantity,
//   SHHFilterMessage,
//   Syncing,
//   Tag,
//   TransactionObject,
//   TransactionOptions,
//   TransactionReceipt
// } from '../Schema'
// import { BigNumber } from './BigNumber'
// import { stringToUtf8Bytes } from './utf8'

/**
 * Should format the output to a big number
 *
 * @param output - The provided output
 */
// export function outputBigNumberFormatter(output: BigNumber.Value): BigNumber {
//   return utils.toBigNumber(output)
// }

/**
 * Returns true if the provided blockNumber is 'latest', 'pending' or 'earliest
 *
 * @param blockNumber - The given blocknumber
 */
export function isPredefinedBlockNumber(blockNumber: utils.Quantity | utils.Tag): blockNumber is utils.Tag {
  return blockNumber === "latest" || blockNumber === "pending" || blockNumber === "earliest"
}

// export function inputDefaultBlockNumberFormatter(blockNumber: Quantity | Tag): string | Tag | null {
//   if (blockNumber === undefined) {
//     return config.defaultBlock
//   }
//   return inputBlockNumberFormatter(blockNumber)
// }

export function inputBlockNumberFormatter(blockNumber: utils.Quantity | utils.Tag | null): string | null {
  if (blockNumber === undefined || blockNumber == null) {
    return null
  } else if (isPredefinedBlockNumber(blockNumber)) {
    return blockNumber
  }
  return utils.toHex(blockNumber)
}

// /**
//  * Formats the input of a transaction and converts all values to HEX
//  */
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

  if (options.data && !options.data.startsWith("0x") && /^[A-Za-z0-9]+$/.test(options.data)) {
    options.data = "0x" + options.data
  }

  return options
}

// /**
//  * Ensures a correct transactionId is provided
//  */
// export function inputTransactionId(txId: string) {
//   if (typeof txId != 'string') {
//     throw new Error('The provided input for transactionId is not a string, got: ' + JSON.stringify(txId))
//   }

//   if (txId.indexOf('0x') !== 0){
//     throw new Error('TransactionID must start with 0x, got: ' + JSON.stringify(txId))
//   }

//   if (txId.length !== 66){
//     throw new Error('TransactionID must be a 32 byte hex, got: ' + JSON.stringify(txId))
//   }

//   return txId
// }

// /**
//  * Formats the input of a transaction and converts all values to HEX
//  *
//  * @param transaction - options
//  */
// export function inputTransactionFormatter(options: TransactionOptions) {
//   if (typeof options !== 'object') {
//     throw new Error('Did not provide transaction options')
//   }

//   if (!options.from) {
//     throw new Error('Missing "from" in transaction options')
//   }

//   options.from = inputAddressFormatter(options.from)

//   if (options.to) {
//     // it might be contract creation
//     options.to = inputAddressFormatter(options.to)
//   }

//   if (options.gasPrice !== undefined) options.gasPrice = utils.fromDecimal(options.gasPrice)
//   if (options.gas !== undefined) options.gas = utils.fromDecimal(options.gas)
//   if (options.value !== undefined) options.value = utils.fromDecimal(options.value)
//   if (options.nonce !== undefined) options.nonce = utils.fromDecimal(options.nonce)

//   if (options.data && !options.data.startsWith('0x') && /^[A-Za-z0-9]+$/.test(options.data)) {
//     options.data = '0x' + options.data
//   }

//   return options
// }

// /**
//  * Formats the output of a transaction to its proper values
//  *
//  * @param tx - The transaction
//  */
// export function outputTransactionFormatter(tx: TransactionObject) {
//   if (!tx) return null

//   if (tx.blockNumber !== null) {
//     tx.blockNumber = utils.toDecimal(tx.blockNumber)
//   }
//   if (tx.transactionIndex !== null) {
//     tx.transactionIndex = utils.toDecimal(tx.transactionIndex)
//   }
//   tx.nonce = utils.toDecimal(tx.nonce)
//   tx.gas = utils.toDecimal(tx.gas)
//   tx.gasPrice = utils.toBigNumber(tx.gasPrice)
//   tx.value = utils.toBigNumber(tx.value)
//   return tx
// }

// /**
//  * Formats the output of a transaction receipt to its proper values
//  *
//  * @param receipt - The transaction receipt
//  */
// export function outputTransactionReceiptFormatter(receipt: TransactionReceipt) {
//   if (!receipt) return null

//   if (receipt.blockNumber !== null) receipt.blockNumber = utils.toDecimal(receipt.blockNumber)
//   if (receipt.transactionIndex !== null) receipt.transactionIndex = utils.toDecimal(receipt.transactionIndex)

//   receipt.cumulativeGasUsed = utils.toDecimal(receipt.cumulativeGasUsed)
//   receipt.gasUsed = utils.toDecimal(receipt.gasUsed)

//   if (receipt.logs && utils.isArray(receipt.logs)) {
//     receipt.logs = receipt.logs.map(function (log) {
//       return outputLogFormatter(log)
//     })
//   }

//   receipt.status = utils.toDecimal(receipt.status || '')

//   return receipt
// }

// /**
//  * Formats the output of a block to its proper value
//  */
// export function outputBlockFormatter(block: BlockObject | null) {
//   if (!block) return null
//   // transform to number
//   block.gasLimit = utils.toDecimal(block.gasLimit)
//   block.gasUsed = utils.toDecimal(block.gasUsed)
//   block.size = utils.toDecimal(block.size)
//   block.timestamp = utils.toDecimal(block.timestamp)
//   if (block.number !== null) block.number = utils.toDecimal(block.number)

//   block.difficulty = utils.toBigNumber(block.difficulty)
//   block.totalDifficulty = utils.toBigNumber(block.totalDifficulty)

//   if (utils.isArray(block.transactions)) {
//     block.transactions.forEach(function (item: string | TransactionObject, ix: number) {
//       if (!utils.isString(item)) {
//         block.transactions[ix] = outputTransactionFormatter(item) || block.transactions[ix]
//       }
//     })
//   }

//   return block
// }

// /**
//  * Formats the output of a log
//  */
// export function outputLogFormatter(log: LogObject) {
//   if (!log) return log

//   if (log.blockNumber) {
//     log.blockNumber = utils.toDecimal(log.blockNumber)
//   }

//   if (log.transactionIndex) {
//     log.transactionIndex = utils.toDecimal(log.transactionIndex)
//   }

//   if (log.logIndex) {
//     log.logIndex = utils.toDecimal(log.logIndex)
//   }

//   return log
// }

// /**
//  * Formats the input of a whisper post and converts all values to HEX
//  */
// export function inputPostFormatter(post: any) {
//   if (!post) return null

//   post.ttl = utils.fromDecimal(post.ttl)
//   post.workToProve = utils.fromDecimal(post.workToProve)
//   post.priority = utils.fromDecimal(post.priority)

//   // fallback
//   if (!utils.isArray(post.topics)) {
//     post.topics = post.topics ? [post.topics as string] : []
//   }

//   // format the following options
//   post.topics = post.topics.map(function (topic: string) {
//     // convert only if not hex
//     return topic.indexOf('0x') === 0 ? topic : '0x' + utils.bytesToHex(stringToUtf8Bytes(topic))
//   })

//   return post
// }

// /**
//  * Formats the output of a received post message
//  */
// export function outputPostFormatter(post: SHHFilterMessage) {
//   if (!post) return null

//   post.expiry = utils.toDecimal(post.expiry)
//   post.sent = utils.toDecimal(post.sent)
//   post.ttl = utils.toDecimal(post.ttl)
//   post.workProved = utils.toDecimal(post.workProved)

//   // format the following options
//   if (!post.topics) {
//     post.topics = []
//   }
//   post.topics = post.topics.map(function (topic) {
//     return utils.toAscii(topic)
//   })

//   return post
// }

export function inputAddressFormatter(address: string) {
  if (utils.isStrictAddress(address)) {
    return address
  } else if (utils.isAddress(address)) {
    return "0x" + address
  }
  throw new Error(`Invalid address: ${JSON.stringify(address)}`)
}

// export function inputFilterOptions(options: FilterOptions) {
//   // TODO: validations
//   return options
// }

// export function outputSyncingFormatter(result: Syncing) {
//   if (!result) {
//     return result
//   }

//   result.startingBlock = utils.toDecimal(result.startingBlock)
//   result.currentBlock = utils.toDecimal(result.currentBlock)
//   result.highestBlock = utils.toDecimal(result.highestBlock)

//   if (result.knownStates) {
//     result.knownStates = utils.toDecimal(result.knownStates)
//     result.pulledStates = utils.toDecimal(result.pulledStates!)
//   }

//   return result
// }
