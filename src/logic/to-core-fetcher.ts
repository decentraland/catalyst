import type { IFetchComponent as WkcFetchComponent } from '@well-known-components/interfaces'
import type { IFetchComponent as CoreCommonsFetchComponent } from '@dcl/core-commons'

/**
 * The content server stores its fetcher as the `@well-known-components/interfaces` `IFetchComponent`
 * that most consumers expect (block-indexer, the app graph), but some `@dcl` libraries —
 * `@dcl/thegraph-component` and `@dcl/snapshots-fetcher` — type it against the structurally-identical
 * `@dcl/core-commons` `IFetchComponent`. The two differ only in nominal Request/Response identity, so
 * this asserts across that gap in a single place instead of repeating an `as unknown as` at each call.
 */
export function toCoreFetcher(fetcher: WkcFetchComponent): CoreCommonsFetchComponent {
  return fetcher as unknown as CoreCommonsFetchComponent
}
