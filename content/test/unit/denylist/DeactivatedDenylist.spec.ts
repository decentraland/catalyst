import { DeactivatedDenylist } from '@katalyst/content/denylist/DeactivatedDenylist'
import { DenylistMetadata, DenylistOperationStatus, DenylistValidationType } from '@katalyst/content/denylist/Denylist'
import { DenylistTarget, DenylistTargetId, DenylistTargetType } from '@katalyst/content/denylist/DenylistTarget'
import { DenylistRepository } from '@katalyst/content/repository/extensions/DenylistRepository'
import { instance, mock, when } from 'ts-mockito'

describe('DeactivatedDenylist', () => {
  const deactivatedDenylist: DeactivatedDenylist = new DeactivatedDenylist()
  const target: DenylistTarget = mock(DenylistTarget)
  const metadata: DenylistMetadata = { timestamp: 1, authChain: [] }
  const denylistRepository: DenylistRepository = mock(DenylistRepository)

  it(`Given a DeactivatedDenylist, when addTarget, then it returns an error`, async () => {
    const result = await deactivatedDenylist.addTarget(target, metadata)

    expect(result.status).toEqual(DenylistOperationStatus.ERROR)
    expect(result.type).toEqual(DenylistValidationType.CONFIGURATION)
    expect(result.message).toEqual('Denylist is not activated, so you can not add a target to the denylist.')
  })

  it(`Given a DeactivatedDenylist, when removeTarget, then it returns an error`, async () => {
    const result = await deactivatedDenylist.removeTarget(target, metadata)

    expect(result.status).toEqual(DenylistOperationStatus.ERROR)
    expect(result.type).toEqual(DenylistValidationType.CONFIGURATION)
    expect(result.message).toEqual('Denylist is not activated, so you can not remove a target from the denylist.')
  })

  it(`Given a DeactivatedDenylist, when getAllDenylistedTargets, then it returns empty array`, async () => {
    const getAllDenylistedTargetsResult = await deactivatedDenylist.getAllDenylistedTargets()

    expect(getAllDenylistedTargetsResult).toEqual([])
  })

  it(`Given a DeactivatedDenylist, when isTargetDenylisted, then it returns false`, async () => {
    const isTargetDenylistedResult = await deactivatedDenylist.isTargetDenylisted(target)

    expect(isTargetDenylistedResult).toBeFalsy()
  })

  it(`Given a DeactivatedDenylist, when areTargetsDenylisted, then it returns a false map`, async () => {
    when(target.getType()).thenReturn(DenylistTargetType.ADDRESS)
    when(target.getId()).thenReturn('id')
    const areTargetsDenylistedResult = await deactivatedDenylist.areTargetsDenylisted(denylistRepository, [
      instance(target)
    ])

    // Build expected result
    const expectedResult: Map<DenylistTargetType, Map<DenylistTargetId, boolean>> = new Map()
    expectedResult.set(DenylistTargetType.ADDRESS, new Map())
    expectedResult.get(DenylistTargetType.ADDRESS)?.set('id', false)

    expect(areTargetsDenylistedResult).toEqual(expectedResult)
  })
})
