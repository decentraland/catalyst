import { DeactivatedDenylist } from '@katalyst/content/denylist/DeactivatedDenylist'
import { DenylistMetadata } from '@katalyst/content/denylist/Denylist'
import { DenylistTarget, DenylistTargetId, DenylistTargetType } from '@katalyst/content/denylist/DenylistTarget'
import { DenylistRepository } from '@katalyst/content/repository/extensions/DenylistRepository'
import { assertPromiseIsRejected } from '@katalyst/test-helpers/PromiseAssertions'
import { instance, mock, when } from 'ts-mockito'

describe('DeactivatedDenylist', () => {
  const deactivatedDenylist: DeactivatedDenylist = new DeactivatedDenylist()
  const target: DenylistTarget = mock(DenylistTarget)
  const metadata: DenylistMetadata = { timestamp: 1, authChain: [] }
  const denylistRepository: DenylistRepository = mock(DenylistRepository)

  it(`Given a DeactivatedDenylist, when addTarget, then it throws an error`, async () => {
    await assertPromiseIsRejected(() => deactivatedDenylist.addTarget(target, metadata))
  })

  it(`Given a DeactivatedDenylist, when removeTarget, then it throws an error`, async () => {
    await assertPromiseIsRejected(() => deactivatedDenylist.removeTarget(target, metadata))
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
