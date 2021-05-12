import { DenylistMetadata, DenylistSignatureValidationStatus } from '@katalyst/content/denylist/Denylist'
import { DenylistTarget, DenylistTargetId, DenylistTargetType } from '@katalyst/content/denylist/DenylistTarget'
import { DummyDenylist } from '@katalyst/content/denylist/DummyDenylist'
import { DenylistRepository } from '@katalyst/content/repository/extensions/DenylistRepository'
import { instance, mock, when } from 'ts-mockito'

describe('DummyDenylist', () => {
  const dummyDenylist: DummyDenylist = new DummyDenylist()
  const target: DenylistTarget = mock(DenylistTarget)
  const metadata: DenylistMetadata = { timestamp: 1, authChain: [] }
  const denylistRepository: DenylistRepository = mock(DenylistRepository)

  it(`Given a DummyDenylist, when addTarget, then it returns error status`, async () => {
    const addTargetResult = (await dummyDenylist.addTarget(target, metadata)).status

    expect(addTargetResult).toEqual(DenylistSignatureValidationStatus.ERROR)
  })

  it(`Given a DummyDenylist, when removeTarget, then it returns error status`, async () => {
    const removeTargetResult = (await dummyDenylist.removeTarget(target, metadata)).status

    expect(removeTargetResult).toEqual(DenylistSignatureValidationStatus.ERROR)
  })

  it(`Given a DummyDenylist, when getAllDenylistedTargets, then it returns empty array`, async () => {
    const getAllDenylistedTargetsResult = await dummyDenylist.getAllDenylistedTargets()

    expect(getAllDenylistedTargetsResult).toEqual([])
  })

  it(`Given a DummyDenylist, when isTargetDenylisted, then it returns false`, async () => {
    const isTargetDenylistedResult = await dummyDenylist.isTargetDenylisted(target)

    expect(isTargetDenylistedResult).toBeFalsy()
  })

  it(`Given a DummyDenylist, when areTargetsDenylisted, then it returns a false map`, async () => {
    when(target.getType()).thenReturn(DenylistTargetType.ADDRESS)
    when(target.getId()).thenReturn('id')
    const areTargetsDenylistedResult = await dummyDenylist.areTargetsDenylisted(denylistRepository, [instance(target)])

    // Build expected result
    const expectedResult: Map<DenylistTargetType, Map<DenylistTargetId, boolean>> = new Map()
    expectedResult.set(DenylistTargetType.ADDRESS, new Map())
    expectedResult.get(DenylistTargetType.ADDRESS)?.set('id', false)

    expect(areTargetsDenylistedResult).toEqual(expectedResult)
  })
})
