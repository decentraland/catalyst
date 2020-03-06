import fetch, { Response } from "node-fetch"
import { FailedDeployment } from "@katalyst/content/service/errors/FailedDeploymentsManager"
import { EntityType, EntityId, Entity, Pointer } from "@katalyst/content/service/Entity"
import { AuditInfo } from "@katalyst/content/service/audit/Audit"
import { EthAddress } from "dcl-crypto"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { AccessCheckerImpl } from "@katalyst/content/service/access/AccessCheckerImpl"
import { ContentAuthenticator } from "@katalyst/content/service/auth/Authenticator"
import { DEFAULT_DCL_PARCEL_ACCESS_URL } from "@katalyst/content/Environment"


describe("Failed Deployments validations", () => {

    beforeAll(async () => {
    })

    afterAll(async () => {
    })

    var MAX_SAFE_TIMEOUT = Math.pow(2, 31) - 1;

    xit('Review servers list', async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), DEFAULT_DCL_PARCEL_ACCESS_URL);

        const failedDeployments: FailedDeployment[] = await getFailedDeployments()
        const failedScenes = failedDeployments.filter(fd => fd.deployment.entityType===EntityType.SCENE)
        const failedProfiles = failedDeployments.filter(fd => fd.deployment.entityType===EntityType.PROFILE)
        const servers = failedScenes.map(fd => fd.deployment.serverName).filter(onlyUnique)

        console.log(`Total Failed Deployments: ${failedDeployments.length}`)
        console.log(`Scenes  : ${failedScenes.length}`)
        console.log(`Profiles: ${failedProfiles.length}`)
        console.log('------------------------------')
        console.log(`Servers:`)
        servers.forEach(server => console.log(`  ${server}`))
        console.log('------------------------------')
        let solvedErrors = 0
        for(let i=0; i < failedScenes.length; i++) {
            const fd = failedScenes[i]
            const accessSnapshot = await getAccessSnapshot(fd.deployment.serverName, fd.deployment.entityId)
            if (accessSnapshot) {
                const accessErrors: string[] = await accessChecker.hasAccess(EntityType.SCENE, accessSnapshot.pointers, accessSnapshot.timestamp, accessSnapshot.ethAddress)
                if (accessErrors.length===0) {
                    console.log(`=> ${i+1} of ${failedScenes.length}: #Fixed#`, fd.deployment.entityId, accessSnapshot.ethAddress, accessSnapshot.timestamp, `[${accessSnapshot.pointers.join(',')}]`)
                    solvedErrors++
                } else {
                    console.log(`=> ${i+1} of ${failedScenes.length}: Invalid`, fd.deployment.entityId, accessSnapshot.ethAddress, accessSnapshot.timestamp, `[${accessSnapshot.pointers.join(',')}]`)
                    console.log(accessErrors)
                }
            } else {
                console.log(`=> ${i+1} of ${failedScenes.length}: !!ERR!!`, fd.deployment.serverName, fd.deployment.entityId, fd.deployment.timestamp)
            }
        }
        console.log('------------------------------')
        console.log(`Solved Errors: ${solvedErrors}`)
        console.log('------------------------------')
    }, MAX_SAFE_TIMEOUT)

    xit('Review particular', async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), DEFAULT_DCL_PARCEL_ACCESS_URL);
        const accessSnapshot = {
            pointers: ['-75,71'],
            ethAddress: '0xa7c825bb8c2c4d18288af8efe38c8bf75a1aab51',
            timestamp: 1583375184237
        }
        const accessErrors: string[] = await accessChecker.hasAccess(EntityType.SCENE, accessSnapshot.pointers, accessSnapshot.timestamp, accessSnapshot.ethAddress)
        if (accessErrors.length===0) {
            console.log('OK')
        } else {
            console.log('NO ACCESS', accessErrors)
        }
    }, MAX_SAFE_TIMEOUT)

})

async function getFailedDeployments(): Promise<FailedDeployment[]> {
    return fetchArray(`https://bot1-catalyst.decentraland.org/content/failedDeployments`)
}

function onlyUnique<T>(value: T, index: number, self: T[]): boolean {
    return self.indexOf(value) === index;
}

const serverDomains = {
    '02c7e319-3fd7-4bf4-9764-b7bf1feea490': 'peer.decentraland.org',
    '0b447141-540a-42dd-a579-3d95e6e83259': 'interconnected.online'
}

function getServerContentBaseUrl(serverName: string): string {
    const serverDomain: string = serverDomains[serverName] ?? 'peer.decentraland.org'
    return `https://${serverDomain}/content`
}

type AccessSnapshot = {
    pointers: Pointer[],
    ethAddress: EthAddress,
    timestamp: Timestamp
}
async function getAccessSnapshot(serverDomain: string, entityId: EntityId): Promise<AccessSnapshot | undefined>{
    const serverBaseUrl = getServerContentBaseUrl(serverDomain)
    const entity: Entity | undefined = await fetchFirst(`${serverBaseUrl}/entities/scene?id=${entityId}`)
    const audit: AuditInfo | undefined = await fetchObject(`${serverBaseUrl}/audit/scene/${entityId}`)
    if (entity && audit) {
        return {
            pointers: entity.pointers,
            ethAddress: audit.authChain[0].payload,
            timestamp: audit.deployedTimestamp
        }
    }
    return undefined
}

async function fetchObject<T>(url: string): Promise<T | undefined> {
    const response: Response = await fetch(url)
    if (response.ok) {
        const data: T = await response.json()
        if (data) {
            return data
        }
    }
    return undefined
}

async function fetchArray<T>(url: string): Promise<T[]> {
    const data: T[] | undefined = await fetchObject(url)
    return data ? data : []
}

async function fetchFirst<T>(url: string): Promise<T | undefined> {
    const data: T[] = await fetchArray(url)
    return data.length > 0 ? data[0] : undefined
}
