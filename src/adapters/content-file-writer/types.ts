export type IFile = {
  filePath: string
  appendDebounced: (buffer: string) => Promise<void>
  close: () => Promise<void>
  delete: () => Promise<void>
  store: () => Promise<string>
}
