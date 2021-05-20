import { ActiveDenylist } from '@katalyst/content/denylist/ActiveDenylist'
import { DenylistTarget } from '@katalyst/content/denylist/DenylistTarget'
import { DenylistRepository } from '@katalyst/content/repository/extensions/DenylistRepository'
import { Repository } from '@katalyst/content/repository/Repository'
import { ContentAuthenticator } from '@katalyst/content/service/auth/Authenticator'
import { ContentCluster } from '@katalyst/content/service/synchronization/ContentCluster'
import { anything, instance, mock, verify } from 'ts-mockito'

describe('ActiveDenylist', () => {
  const repository: Repository = mock<Repository>()
  const authenticator: ContentAuthenticator = mock<ContentAuthenticator>()
  const cluster: ContentCluster = mock<ContentCluster>()
  const network: string = 'network'
  let denylist: ActiveDenylist

  beforeAll(async () => {
    denylist = new ActiveDenylist(instance(repository), instance(authenticator), instance(cluster), network)
  })

  it(`Given an empty denylist, when getAllDenylistedTargets, then the database is not accessed`, async () => {
    await denylist.getAllDenylistedTargets()

    verify(repository.run(anything())).never()
    verify(repository.tx(anything(), anything())).never()
  })

  it(`Given an empty denylist, when isTargetDenylisted, then the database is not accessed`, async () => {
    const target: DenylistTarget = mock<DenylistTarget>()
    await denylist.isTargetDenylisted(instance(target))

    verify(repository.run(anything())).never()
    verify(repository.tx(anything(), anything())).never()
  })

  it(`Given an empty denylist, when areTargetsDenylisted, then the database is not accessed`, async () => {
    const target: DenylistTarget = mock<DenylistTarget>()
    const denylistRepo: DenylistRepository = mock<DenylistRepository>()
    await denylist.areTargetsDenylisted(instance(denylistRepo), [instance(target)])

    verify(repository.run(anything())).never()
    verify(repository.tx(anything(), anything())).never()
    verify(denylistRepo.getDenylistedTargets(anything())).never()
  })
})
