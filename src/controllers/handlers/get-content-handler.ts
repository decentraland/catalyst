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

  // Check conditional headers before touching storage: content is immutable and content-addressed, so
  // a matching ETag means the client's cached copy is still valid. Returning 304 here costs zero
  // storage round-trips on the hottest endpoint.
  //
  // Trade-off: this now answers 304 even for content the server has since GC'd or never synced, where
  // the old fetch-first path returned 404. For content-addressed data a 304 is still correct — the ETag
  // is derived from the hash, so a client presenting it already holds the exact, immutable bytes — and a
  // client without a matching ETag still falls through to the normal 404 below.
  const notModified = checkNotModified(context.request, hash)
  if (notModified) return notModified

  const rangeHeader = context.request.headers.get('range')
  // No preloaded fileInfo: retrieveContentWithRange fetches metadata only for range requests, and a
  // plain GET/HEAD resolves existence via retrieve() (returns undefined -> 404 below).
  const result = await retrieveContentWithRange(context.components.storage, hash, rangeHeader)
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
  // Only sniff MIME when requested; otherwise skip the extra content stream (see createContentFileHeaders).
  const headers = await createContentFileHeaders(content, hash, shouldCalculateContentType)

  return {
    status,
    headers: {
      ...headers,
      ...result.rangeHeaders
    },
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
