import { EntityType } from '@dcl/schemas'
import { createPointerLockManager } from '../../../../src/adapters/pointer-lock-manager'
import { IPointerLockManager } from '../../../../src/adapters/pointer-lock-manager/types'

describe('pointer-lock-manager', () => {
  let manager: IPointerLockManager

  beforeEach(() => {
    manager = createPointerLockManager()
  })

  describe('when calling tryAcquire', () => {
    describe('and no pointers are currently in flight', () => {
      it('should return an empty array', () => {
        expect(manager.tryAcquire(EntityType.SCENE, ['0,0', '0,1'])).toEqual([])
      })

      it('should acquire all the requested pointers', () => {
        manager.tryAcquire(EntityType.SCENE, ['0,0', '0,1'])

        expect(manager.tryAcquire(EntityType.SCENE, ['0,0'])).toEqual(['0,0'])
        expect(manager.tryAcquire(EntityType.SCENE, ['0,1'])).toEqual(['0,1'])
      })
    })

    describe('and the requested pointers do not overlap with in-flight ones', () => {
      beforeEach(() => {
        manager.tryAcquire(EntityType.SCENE, ['0,0'])
      })

      it('should return an empty array and acquire the new pointers', () => {
        expect(manager.tryAcquire(EntityType.SCENE, ['1,0', '2,0'])).toEqual([])
        expect(manager.tryAcquire(EntityType.SCENE, ['1,0'])).toEqual(['1,0'])
        expect(manager.tryAcquire(EntityType.SCENE, ['2,0'])).toEqual(['2,0'])
      })
    })

    describe('and every requested pointer is already in flight', () => {
      beforeEach(() => {
        manager.tryAcquire(EntityType.SCENE, ['0,0', '0,1'])
      })

      it('should return all of them as conflicts', () => {
        expect(manager.tryAcquire(EntityType.SCENE, ['0,0', '0,1'])).toEqual(['0,0', '0,1'])
      })
    })

    describe('and only some of the requested pointers are in flight', () => {
      beforeEach(() => {
        manager.tryAcquire(EntityType.SCENE, ['0,0'])
      })

      it('should return only the conflicting subset', () => {
        expect(manager.tryAcquire(EntityType.SCENE, ['0,0', '1,0'])).toEqual(['0,0'])
      })

      it('should not acquire any of the non-conflicting pointers (all-or-nothing)', () => {
        manager.tryAcquire(EntityType.SCENE, ['0,0', '1,0'])

        // If '1,0' had been acquired by the partial-conflict call, this would return ['1,0'].
        expect(manager.tryAcquire(EntityType.SCENE, ['1,0'])).toEqual([])
      })
    })

    describe('and the same pointer is requested across different entity types', () => {
      beforeEach(() => {
        manager.tryAcquire(EntityType.SCENE, ['0,0'])
      })

      it('should treat the locks independently', () => {
        expect(manager.tryAcquire(EntityType.PROFILE, ['0,0'])).toEqual([])
        expect(manager.tryAcquire(EntityType.WEARABLE, ['0,0'])).toEqual([])
      })
    })

    describe('and an empty pointer list is requested', () => {
      it('should return an empty array', () => {
        expect(manager.tryAcquire(EntityType.SCENE, [])).toEqual([])
      })

      it('should not affect previously acquired pointers', () => {
        manager.tryAcquire(EntityType.SCENE, ['0,0'])
        manager.tryAcquire(EntityType.SCENE, [])

        expect(manager.tryAcquire(EntityType.SCENE, ['0,0'])).toEqual(['0,0'])
      })
    })
  })

  describe('when calling release', () => {
    describe('and the released pointers were previously acquired', () => {
      beforeEach(() => {
        manager.tryAcquire(EntityType.SCENE, ['0,0', '0,1'])
      })

      it('should make them available for tryAcquire again', () => {
        manager.release(EntityType.SCENE, ['0,0', '0,1'])

        expect(manager.tryAcquire(EntityType.SCENE, ['0,0', '0,1'])).toEqual([])
      })
    })

    describe('and only some of the in-flight pointers are released', () => {
      beforeEach(() => {
        manager.tryAcquire(EntityType.SCENE, ['0,0', '0,1'])
        manager.release(EntityType.SCENE, ['0,0'])
      })

      it('should leave the unreleased pointers in flight', () => {
        expect(manager.tryAcquire(EntityType.SCENE, ['0,1'])).toEqual(['0,1'])
      })

      it('should make the released pointers available again', () => {
        expect(manager.tryAcquire(EntityType.SCENE, ['0,0'])).toEqual([])
      })
    })

    describe('and the released pointers were never acquired', () => {
      beforeEach(() => {
        manager.tryAcquire(EntityType.SCENE, ['0,0'])
      })

      it('should be a no-op for the unknown pointers', () => {
        expect(() => manager.release(EntityType.SCENE, ['9,9'])).not.toThrow()
      })

      it('should leave the previously acquired pointers untouched', () => {
        manager.release(EntityType.SCENE, ['9,9'])

        expect(manager.tryAcquire(EntityType.SCENE, ['0,0'])).toEqual(['0,0'])
      })
    })

    describe('and the entity type was never used', () => {
      it('should not throw', () => {
        expect(() => manager.release(EntityType.WEARABLE, ['0,0'])).not.toThrow()
      })

      it('should not affect locks of other entity types', () => {
        manager.tryAcquire(EntityType.SCENE, ['0,0'])
        manager.release(EntityType.WEARABLE, ['0,0'])

        expect(manager.tryAcquire(EntityType.SCENE, ['0,0'])).toEqual(['0,0'])
      })
    })

    describe('and the released pointers belong to a different entity type than was acquired', () => {
      beforeEach(() => {
        manager.tryAcquire(EntityType.SCENE, ['0,0'])
        manager.release(EntityType.PROFILE, ['0,0'])
      })

      it('should leave the original lock untouched', () => {
        expect(manager.tryAcquire(EntityType.SCENE, ['0,0'])).toEqual(['0,0'])
      })
    })

    describe('and the last in-flight pointer for an entity type is released', () => {
      beforeEach(() => {
        manager.tryAcquire(EntityType.SCENE, ['0,0'])
        manager.release(EntityType.SCENE, ['0,0'])
      })

      it('should leave the manager in the same state as a fresh one', () => {
        expect(manager.tryAcquire(EntityType.SCENE, ['0,0'])).toEqual([])
      })
    })

    describe('and an empty pointer list is released', () => {
      beforeEach(() => {
        manager.tryAcquire(EntityType.SCENE, ['0,0'])
        manager.release(EntityType.SCENE, [])
      })

      it('should leave the previously acquired pointers in flight', () => {
        expect(manager.tryAcquire(EntityType.SCENE, ['0,0'])).toEqual(['0,0'])
      })
    })
  })
})
