import { Database } from '../../repository/Database'

export class SystemPropertiesRepository {
  constructor(private readonly db: Database) {}

  getProperty(key: string): Promise<string | undefined> {
    return this.db.oneOrNone(
      `SELECT value FROM system_properties WHERE key = $1`,
      [key],
      (row) => (row && row.value) ?? undefined
    )
  }

  setProperty(key: string, value: string) {
    return this.db.none(
      `
            INSERT INTO system_properties (key, value) VALUES ($1, $2)
            ON CONFLICT ON CONSTRAINT system_properties_pkey
            DO UPDATE SET value = $2`,
      [key, value]
    )
  }
}
