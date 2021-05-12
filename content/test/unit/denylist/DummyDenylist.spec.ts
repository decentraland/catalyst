import { DenylistMetadata, DenylistSignatureValidationStatus } from '@katalyst/content/denylist/Denylist'
import { DenylistTarget } from '@katalyst/content/denylist/DenylistTarget'
import { DummyDenylist } from '@katalyst/content/denylist/DummyDenylist'
import { DenylistRepository } from '@katalyst/content/repository/extensions/DenylistRepository'
import { mock } from 'ts-mockito'

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

  it(`Given a DummyDenylist, when isTargetDenylisted, then it returns error status`, async () => {
    const isTargetDenylistedResult = await dummyDenylist.isTargetDenylisted(target)

    expect(isTargetDenylistedResult).toBeFalsy()
  })

  it(`Given a DummyDenylist, when areTargetsDenylisted, then it returns error status`, async () => {
    const areTargetsDenylistedResult = await dummyDenylist.areTargetsDenylisted(denylistRepository, [target])

    expect(areTargetsDenylistedResult).toEqual(new Map())
  })
})
