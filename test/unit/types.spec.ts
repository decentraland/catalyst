import { EntityType } from '@dcl/schemas'
import { parseEntityType } from '../../src/types'

describe('when parsing an entity type', () => {
  let input: string
  let result: EntityType | undefined

  describe.each(Object.values(EntityType))('and the input is the exact type value "%s"', (type) => {
    beforeEach(() => {
      input = type
      result = parseEntityType(input)
    })

    it('should return that entity type', () => {
      expect(result).toBe(type)
    })
  })

  describe.each([
    ['scenes', EntityType.SCENE],
    ['profiles', EntityType.PROFILE],
    ['wearables', EntityType.WEARABLE],
    ['stores', EntityType.STORE],
    ['emotes', EntityType.EMOTE]
  ])('and the input is the plural form "%s"', (plural, expected) => {
    beforeEach(() => {
      input = plural
      result = parseEntityType(input)
    })

    it('should return the singular entity type', () => {
      expect(result).toBe(expected)
    })
  })

  describe('and the input is the outfits type with an extra trailing "s"', () => {
    beforeEach(() => {
      input = 'outfitss'
      result = parseEntityType(input)
    })

    it('should return undefined', () => {
      expect(result).toBeUndefined()
    })
  })

  describe('and the input is in upper case', () => {
    beforeEach(() => {
      input = 'OUTFITS'
      result = parseEntityType(input)
    })

    it('should return the entity type', () => {
      expect(result).toBe(EntityType.OUTFITS)
    })
  })

  describe('and the input is surrounded by whitespace', () => {
    beforeEach(() => {
      input = ' profile '
      result = parseEntityType(input)
    })

    it('should return the entity type', () => {
      expect(result).toBe(EntityType.PROFILE)
    })
  })

  describe('and the input is not an entity type', () => {
    beforeEach(() => {
      input = 'non-existent-type'
      result = parseEntityType(input)
    })

    it('should return undefined', () => {
      expect(result).toBeUndefined()
    })
  })

  describe('and the input is an object prototype property name', () => {
    beforeEach(() => {
      input = 'constructor'
      result = parseEntityType(input)
    })

    it('should return undefined', () => {
      expect(result).toBeUndefined()
    })
  })
})
