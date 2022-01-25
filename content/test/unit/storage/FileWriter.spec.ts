// import os from 'os'
// import path from 'path'

import { PassThrough } from "stream"
import { createUnsavedFile } from "../../../src/storage/FileWriter"
const fs = require('fs')
jest.mock('fs')

describe('FileWriter', () => {

  it(`When temporary file writer is created, `, async () => {
    const writeStreamMock = createMockWriteStream(new PassThrough())

    const mockFilePath = '/oh/what/a/file.txt'
    fs.createWriteStream.mockReturnValueOnce(writeStreamMock)
    const tmpFile = createUnsavedFile('id', mockFilePath)

    await tmpFile.append('hola!')
    await tmpFile.save()

    expect(writeStreamMock.write).toHaveBeenCalled()
    expect(writeStreamMock.read().toString('utf8')).toBe('hola!')
  })

  it(`When content is stored, then the correct file structure is created`, async () => {
    const writeStreamMock = createMockWriteStream(new PassThrough())

    const mockFilePath = '/oh/what/a/file.txt'
    fs.createWriteStream.mockReturnValueOnce(writeStreamMock)
    const tmpFile = createUnsavedFile('id', mockFilePath)

    await tmpFile.append('hola!')
    await tmpFile.save()

    expect(writeStreamMock.write).toHaveBeenCalled()
    expect(writeStreamMock.read().toString('utf8')).toBe('hola!')


      // mockWriteable.write('asdf')
    // const logger = () => console.log('asdf')
    // mockWriteable.on('close', logger)
    // mockWriteable.close()

    // expect(writeMock).toHaveBeenCalled()
    // expect(onMock).toHaveBeenCalledWith('close', logger)

    // jest.spyOn(mockWriteable, 'end').mockImplementation(() => console.log('asdf'))
    // mockWriteable.close = () => { console.log('asdf')}


    // mockWriteable.write('asdf')
    // console.log(mockWriteable.read().toString('utf8'))

  })
})

const createMockWriteStream = (passThrough: PassThrough) => {
  const writeMock: jest.Mock = jest.fn((buffer, cb) => passThrough.write(buffer, cb))
  const endMock: jest.Mock = jest.fn(() => passThrough.end())
  const onMock: jest.Mock = jest.fn((eventName, cb) => passThrough.on(eventName, cb))
  const closeMock: jest.Mock = jest.fn((cb) => {
      if (cb) {
          passThrough.on('close', cb);
        }
        passThrough.end();
  })
  return {
    write: writeMock,
    end: endMock,
    close: closeMock,
    on: onMock,
    read: (size) => passThrough.read(size)
  } as any
}
