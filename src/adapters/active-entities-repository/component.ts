import SQL from 'sql-template-strings'
import { DatabaseClient } from '../../adapters/database'
import { IActiveEntitiesRepository } from './types'

// Pointers are stored lowercased so they match the normalized form every read path uses
// (`getHistoricalDeploymentsQuery`, the active-entities cache key). Entities are content-addressed
// and cannot be rewritten, so normalization has to happen at this write boundary; otherwise a
// mixed-case pointer produces a row that lowercased lookups never find and overwrites never displace.
// Deduplication is required because the entity schema does not enforce unique pointers, and a repeated
// pointer makes `ON CONFLICT(pointer) DO UPDATE` fail ("cannot affect row a second time").
function normalizePointers(pointers: string[]): string[] {
  return [...new Set(pointers.map((p) => p.toLowerCase()))]
}

async function updateActiveDeployments(database: DatabaseClient, pointers: string[], entityId: string): Promise<void> {
  const normalizedPointers = normalizePointers(pointers)
  if (normalizedPointers.length === 0) return
  const value_list = normalizedPointers.map((p, i) => {
    if (i < normalizedPointers.length - 1) {
      return SQL`(${p}, ${entityId}),`
    } else {
      return SQL`(${p}, ${entityId})`
    }
  })
  // sql-template-strings accepts only values on templates, to use structs you need to append queries
  const query = SQL`INSERT INTO active_pointers(pointer, entity_id) VALUES `
  value_list.forEach((v) => query.append(v))
  query.append(SQL` ON CONFLICT(pointer) DO UPDATE SET entity_id = ${entityId};`)

  await database.queryWithValues(query)
}

async function removeActiveDeployments(database: DatabaseClient, pointers: string[]): Promise<void> {
  const normalizedPointers = normalizePointers(pointers)
  if (normalizedPointers.length === 0) return
  const value_list = normalizedPointers.map((p, i) => {
    if (i < normalizedPointers.length - 1) {
      return SQL`${p},`
    } else {
      return SQL`${p}`
    }
  })
  const query = SQL`DELETE FROM active_pointers WHERE pointer IN (`
  value_list.forEach((v) => query.append(v))
  query.append(`);`)

  await database.queryWithValues(query)
}

export function createActiveEntitiesRepository(): IActiveEntitiesRepository {
  return {
    updateActiveDeployments,
    removeActiveDeployments
  }
}
