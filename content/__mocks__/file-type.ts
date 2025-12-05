// Simple mock for the file-type ESM module
export const FileTypeParser = jest.fn().mockImplementation(() => ({
  fromStream: jest.fn().mockResolvedValue({ mime: 'image/png', ext: 'png' }),
  fromBuffer: jest.fn().mockResolvedValue({ mime: 'image/png', ext: 'png' }),
  fromFile: jest.fn().mockResolvedValue({ mime: 'image/png', ext: 'png' })
}))

export const fileTypeFromStream = jest.fn().mockResolvedValue({ mime: 'image/png', ext: 'png' })
export const fileTypeFromBuffer = jest.fn().mockResolvedValue({ mime: 'image/png', ext: 'png' })
export const fileTypeFromFile = jest.fn().mockResolvedValue({ mime: 'image/png', ext: 'png' })
