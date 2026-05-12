import { Entity } from '@dcl/schemas'

export interface IEntityParser {
  /**
   * Parse and validate a serialized entity. Throws `InvalidEntityError` if the buffer
   * does not contain valid JSON or the parsed object is missing required fields.
   *
   * @param buffer - the raw entity bytes
   * @param id - the entity id (used verbatim on the result; the parser does not verify it against the content hash)
   */
  parse(buffer: Uint8Array, id: string): Entity
}
