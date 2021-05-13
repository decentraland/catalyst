import { DenylistMetadata, DenylistSignatureValidationStatus } from '@katalyst/content/denylist/Denylist'
import { DenylistTarget, DenylistTargetId, DenylistTargetType } from '@katalyst/content/denylist/DenylistTarget'
import { NoopDenylist } from '@katalyst/content/denylist/NoopDenylist'
import { DenylistRepository } from '@katalyst/content/repository/extensions/DenylistRepository'
import { instance, mock, when } from 'ts-mockito'

describe('NoopDenylist', () => {
  const noopDenylist: NoopDenylist = new NoopDenylist()
  const target: DenylistTarget = mock(DenylistTarget)
  const metadata: DenylistMetadata = { timestamp: 1, authChain: [] }
  const denylistRepository: DenylistRepository = mock(DenylistRepository)

  it(`Given a NoopDenylist, when addTarget, then it returns error status`, async () => {
    const addTargetResult = (await noopDenylist.addTarget(target, metadata)).status

    expect(addTargetResult).toEqual(DenylistSignatureValidationStatus.ERROR)
  })

  it(`Given a NoopDenylist, when removeTarget, then it returns error status`, async () => {
    const removeTargetResult = (await noopDenylist.removeTarget(target, metadata)).status

    expect(removeTargetResult).toEqual(DenylistSignatureValidationStatus.ERROR)
  })

  it(`Given a NoopDenylist, when getAllDenylistedTargets, then it returns empty array`, async () => {
    const getAllDenylistedTargetsResult = await noopDenylist.getAllDenylistedTargets()

    expect(getAllDenylistedTargetsResult).toEqual([])
  })

  it(`Given a NoopDenylist, when isTargetDenylisted, then it returns false`, async () => {
    const isTargetDenylistedResult = await noopDenylist.isTargetDenylisted(target)

    expect(isTargetDenylistedResult).toBeFalsy()
  })

  it(`Given a NoopDenylist, when areTargetsDenylisted, then it returns a false map`, async () => {
    when(target.getType()).thenReturn(DenylistTargetType.ADDRESS)
    when(target.getId()).thenReturn('id')
    const areTargetsDenylistedResult = await noopDenylist.areTargetsDenylisted(denylistRepository, [instance(target)])

    // Build expected result
    const expectedResult: Map<DenylistTargetType, Map<DenylistTargetId, boolean>> = new Map()
    expectedResult.set(DenylistTargetType.ADDRESS, new Map())
    expectedResult.get(DenylistTargetType.ADDRESS)?.set('id', false)

    expect(areTargetsDenylistedResult).toEqual(expectedResult)
  })
})
