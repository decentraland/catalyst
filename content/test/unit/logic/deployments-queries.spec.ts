import { EntityType, SortingField, SortingOrder } from 'dcl-catalyst-commons'
import { createOrClause, getHistoricalDeploymentsQuery } from '../../../src/logic/database-queries/deployments-queries'

describe('deployments-queries', () => {
  describe('createOrClause', () => {
    describe('with valid arguments', () => {
      it('should return a valid sql statement', () => {
        const myId = 'Hola'
        const toLocalTimestamp = Date.now()
        const result = createOrClause('local_timestamp', '<', toLocalTimestamp, myId)

        const expected =
          '((LOWER(dep1.entity_id) < LOWER($1) AND dep1."local_timestamp" = to_timestamp($2 / 1000.0)) OR (dep1."local_timestamp" < to_timestamp($3 / 1000.0)))'

        expect(expected).toEqual(result.text)
        expect([myId, toLocalTimestamp, toLocalTimestamp]).toEqual(result.values)
      })
    })
  })

  describe('getHistoricalDeploymentsQuery', () => {
    const offset = 0
    const limit = 10
    const from = 1
    const to = 11

    describe("when it doesn't receive a lastId", () => {
      describe('when it receives a field or order to sort by', () => {
        it('should generate the query with the expected sorting', async () => {
          const result = getHistoricalDeploymentsQuery(
            offset,
            limit,
            { from, to },
            {
              field: SortingField.ENTITY_TIMESTAMP,
              order: SortingOrder.ASCENDING
            }
          )

          expect(result.text).toContain(`ORDER BY dep1."entity_timestamp" ASC`)
          expect(result.text).toContain(
            `dep1.entity_timestamp >= to_timestamp($1 / 1000.0) AND dep1.entity_timestamp <= to_timestamp($2 / 1000.0)`
          )
          expect(result.values).toEqual([from, to, limit, offset])
        })
      })

      describe("when it doesn't receive a field or order to sort by", () => {
        it('should generate the query with the default sorting', async () => {
          const result = getHistoricalDeploymentsQuery(offset, limit, { from, to })

          expect(result.text).toContain(`ORDER BY dep1."local_timestamp" DESC`)
          expect(result.text).toContain(
            `dep1.local_timestamp >= to_timestamp($1 / 1000.0) AND dep1.local_timestamp <= to_timestamp($2 / 1000.0)`
          )
          expect(result.values).toEqual([from, to, limit, offset])
        })
      })
    })

    describe('when it receives a lastId', () => {
      const lastId = '1'

      describe('when it receives a field or order to sort by', () => {
        it('should generate the query with the expected sorting', async () => {
          const result = getHistoricalDeploymentsQuery(
            offset,
            limit,
            { from, to },
            {
              field: SortingField.ENTITY_TIMESTAMP,
              order: SortingOrder.ASCENDING
            },
            lastId
          )

          expect(result.text).toContain(`ORDER BY dep1."entity_timestamp" ASC`)
          expect(result.text).toContain(`((LOWER(dep1.entity_id) > LOWER($1)`)
          expect(result.text).toContain(
            `dep1."entity_timestamp" = to_timestamp($2 / 1000.0)) OR ` +
              `(dep1."entity_timestamp" > to_timestamp($3 / 1000.0))) ` +
              `AND dep1.entity_timestamp <= to_timestamp($4 / 1000.0)`
          )

          expect(result.values).toEqual([lastId, from, from, to, limit, offset])
        })
      })

      describe("when it doesn't receive a field or order to sort by", () => {
        it('should generate the query with the default sorting', async () => {
          const result = getHistoricalDeploymentsQuery(offset, limit, { from, to }, undefined, lastId)

          expect(result.text).toContain(`ORDER BY dep1."local_timestamp" DESC`)
          expect(result.text).toContain(`((LOWER(dep1.entity_id) < LOWER($2)`)
          expect(result.text).toContain(
            `dep1.local_timestamp >= to_timestamp($1 / 1000.0) AND ` +
              `((LOWER(dep1.entity_id) < LOWER($2) AND dep1."local_timestamp" = to_timestamp($3 / 1000.0)) ` +
              `OR (dep1."local_timestamp" < to_timestamp($4 / 1000.0)))`
          )

          expect(result.values).toEqual([from, lastId, to, to, limit, offset])
        })
      })
    })

    describe('when there is entityTypes filter', () => {
      it('should add the expected where clause to the query', async () => {
        const entityTypes = [EntityType.SCENE, EntityType.PROFILE]
        const result = getHistoricalDeploymentsQuery(offset, limit, { entityTypes })

        expect(result.text).toContain(`dep1.entity_type = ANY ($1)`)
        expect(result.values).toEqual([entityTypes, limit, offset])
      })
    })

    describe('when there is entityIds filter', () => {
      it('should add the expected where clause to the query', async () => {
        const entityIds = ['A custom string', 'Another custom string']

        const result = getHistoricalDeploymentsQuery(offset, limit, { entityIds })

        expect(result.text).toContain(`dep1.entity_id = ANY ($1)`)
        expect(result.values).toEqual([entityIds, limit, offset])
      })
    })

    describe('when there is onlyCurrentlyPointed filter', () => {
      it('should add the expected where clause to the query', async () => {
        const result = getHistoricalDeploymentsQuery(offset, limit, { onlyCurrentlyPointed: true })

        expect(result.text).toContain(`dep1.deleter_deployment IS NULL`)
      })
    })

    describe('when there is pointers filter', () => {
      it('should add the expected where clause to the query with the pointers in lowercase', async () => {
        const pointers = ['jOn', 'aGus']
        const result = getHistoricalDeploymentsQuery(offset, limit, { pointers })

        expect(result.text).toContain(`dep1.entity_pointers && $1`)
        expect(result.values).toEqual([pointers.map((x) => x.toLowerCase()), limit, offset])
      })
    })

    describe('when there is no filter', () => {
      it('should not add a where clause', async () => {
        const result = getHistoricalDeploymentsQuery(offset, limit)

        expect(result.text).not.toContain(`WHERE`)
      })
    })
  })
})
