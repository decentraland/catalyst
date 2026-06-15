import { IPFSv1, IPFSv2 } from '@dcl/schemas'
import { HandlerContextWithPath } from '../../types'
import { NotFoundError } from '../errors'
import { checkNotModified, createContentFileHeaders, retrieveContentWithRange } from '../utils'

// Method: GET or HEAD
export async function getContentHandler(context: HandlerContextWithPath<'storage' | 'denylist', '/contents/:hashId'>) {
  const shouldCalculateContentType = context.url.searchParams.has('includeMimeType')
  const hash = context.params.hashId

  // Reject anything that isn't a syntactically valid content hash (IPFS CIDv0 `Qm…` or CIDv1 `ba…`)
  // before it reaches storage. The storage layer already refuses keys that resolve outside its root,
  // but an invalid key makes `fileInfo` throw (surfacing as a 500) instead of a clean 404, and this
  // keeps path-traversal probes such as `..%2f..` from ever reaching the filesystem layer.
  if (!IPFSv1.validate(hash) && !IPFSv2.validate(hash)) {
    throw new NotFoundError(`No content found with hash ${hash}`)
  }

  // Denylisted content must not be served, even though the bytes remain in storage. The denylist is
  // keyed by entity id and/or content hash and `:hashId` may be either, so one membership check
  // covers both. Mirrors the filtering already applied on the listing endpoints.
  if (context.components.denylist.isDenylisted(hash)) {
    throw new NotFoundError(`No content found with hash ${hash}`)
  }

  const fileInfo = await context.components.storage.fileInfo(hash)
  if (!fileInfo) {
    throw new NotFoundError(`No content found with hash ${hash}`)
  }

  const notModified = checkNotModified(context.request, hash)
  if (notModified) return notModified

  const rangeHeader = context.request.headers.get('range')
  const result = await retrieveContentWithRange(context.components.storage, hash, rangeHeader, fileInfo)
  if (!result) {
    throw new NotFoundError(`No content found with hash ${hash}`)
  }

  if (result.status === 416) {
    return {
      status: 416,
      headers: result.rangeHeaders
    }
  }

  const { content, status } = result
  const calculatedHeaders = await createContentFileHeaders(content, hash)
  const headers = shouldCalculateContentType
    ? calculatedHeaders
    : { ...calculatedHeaders, 'Content-Type': 'application/octet-stream' }

  return {
    status,
    headers: {
      ...headers,
      ...result.rangeHeaders
    },
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
