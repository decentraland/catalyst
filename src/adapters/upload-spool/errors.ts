export class UploadSpoolFolderTooLongError extends Error {
  constructor(public readonly root: string) {
    super(`UPLOAD_SPOOL_FOLDER '${root}' is too long to hold the spool's owner socket; use a shorter path.`)
    this.name = 'UploadSpoolFolderTooLongError'
  }
}
