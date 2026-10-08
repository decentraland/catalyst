export class UploadSpoolFolderTooLongError extends Error {
  constructor(public readonly root: string) {
    super(`UPLOAD_SPOOL_FOLDER '${root}' is too long to hold the spool's owner socket; use a shorter path.`)
    this.name = 'UploadSpoolFolderTooLongError'
  }
}

/** Thrown for a request folder asked for once the spool has begun stopping. */
export class UploadSpoolStoppedError extends Error {
  constructor() {
    super('This server is shutting down and no longer accepts uploads, please retry shortly.')
    this.name = 'UploadSpoolStoppedError'
  }
}
