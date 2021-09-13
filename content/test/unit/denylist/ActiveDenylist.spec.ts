import { anything, instance, mock, verify } from 'ts-mockito'
import { ActiveDenylist } from '../../../src/denylist/ActiveDenylist'
import { DenylistTarget } from '../../../src/denylist/DenylistTarget'
import { DenylistRepository } from '../../../src/repository/extensions/DenylistRepository'
import { Repository } from '../../../src/repository/Repository'
import { ContentAuthenticator } from '../../../src/service/auth/Authenticator'
import { ContentCluster } from '../../../src/service/synchronization/ContentCluster'

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

    verify(repository.run(anything(), anything())).never()
    verify(repository.tx(anything(), anything())).never()
  })

  it(`Given an empty denylist, when isTargetDenylisted, then the database is not accessed`, async () => {
    const target: DenylistTarget = mock<DenylistTarget>()
    await denylist.isTargetDenylisted(instance(target))

    verify(repository.run(anything(), anything())).never()
    verify(repository.tx(anything(), anything())).never()
  })

  it(`Given an empty denylist, when areTargetsDenylisted, then the database is not accessed`, async () => {
    const target: DenylistTarget = mock<DenylistTarget>()
    const denylistRepo: DenylistRepository = mock<DenylistRepository>()
    await denylist.areTargetsDenylisted(instance(denylistRepo), [instance(target)])

    verify(repository.run(anything(), anything())).never()
    verify(repository.tx(anything(), anything())).never()
    verify(denylistRepo.getDenylistedTargets(anything())).never()
  })
})
