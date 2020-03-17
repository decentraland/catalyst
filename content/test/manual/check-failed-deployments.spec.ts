import fetch, { Response } from "node-fetch"
import { FailedDeployment } from "@katalyst/content/service/errors/FailedDeploymentsManager"
import { EntityType, EntityId, Entity, Pointer } from "@katalyst/content/service/Entity"
import { AuditInfo } from "@katalyst/content/service/audit/Audit"
import { EthAddress, AuthChain, ValidationResult } from "dcl-crypto"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { AccessCheckerImpl } from "@katalyst/content/service/access/AccessCheckerImpl"
import { ContentAuthenticator } from "@katalyst/content/service/auth/Authenticator"
import { DEFAULT_DCL_PARCEL_ACCESS_URL } from "@katalyst/content/Environment"
import fs from 'fs';
import { httpProviderForNetwork } from "../../../contracts/utils"
import ms from "ms"

describe("Failed Deployments validations.", () => {

    var MAX_SAFE_TIMEOUT = Math.pow(2, 31) - 1;

    it('Deployment Errors.', async () => {
        const reviewSceneErrors = false
        const countProfilesByUser = false
        const countProfilesByTimestamp = false
        const checkProfilesAccess = false
        const validateProfilesSignatures = true

        const failedDeployments: FailedDeployment[] = await getFailedDeployments()
        const failedScenes = failedDeployments.filter(fd => fd.deployment.entityType===EntityType.SCENE)
        const failedProfiles = failedDeployments.filter(fd => fd.deployment.entityType===EntityType.PROFILE)
        const servers = failedProfiles.map(fd => fd.deployment.serverName).filter(onlyUnique)

        console.log(`Total Failed Deployments: ${failedDeployments.length}`)
        console.log(`Scenes  : ${failedScenes.length}`)
        console.log(`Profiles: ${failedProfiles.length}`)
        console.log('------------------------------')

        console.log(`Servers:`)
        servers.forEach(server => console.log(`  ${server}`))
        console.log('------------------------------')

        // Retrieve Access Snapshots
        let accessSnapshotsCount = 0
        const accessSnapshots: AccessSnapshot[] = (await Promise.all(failedDeployments
            .map(async fd => {
                console.log(`=> ${(accessSnapshotsCount++)+1} of ${failedDeployments.length}`)
                return await getAccessSnapshot(fd.deployment.serverName, fd.deployment.entityType, fd.deployment.entityId)
            })))
            .filter(notEmpty)

        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), DEFAULT_DCL_PARCEL_ACCESS_URL);

        if (reviewSceneErrors) {
            console.log('------------------------------')
            console.log('Reviewing Scene Errors...')
            console.log('------------------------------')
            const sceneAccessSnapshots = accessSnapshots.filter(accessSnapshot => accessSnapshot.entityType===EntityType.SCENE)
            let sceneSolvedErrors = 0
            await Promise.all(sceneAccessSnapshots.map(async accessSnapshot => {
                const accessErrors: string[] = await accessChecker.hasAccess(EntityType.SCENE, accessSnapshot.pointers, accessSnapshot.timestamp, accessSnapshot.ethAddress)
                if (accessErrors.length===0) {
                    sceneSolvedErrors++
                } else {
                    const overwriteEntity: Entity | undefined = accessSnapshot.overwrittenBy ? await fetchEntity('https://peer.decentraland.org/content', EntityType.SCENE, accessSnapshot.overwrittenBy) : undefined
                    console.log(' => Invalid', accessSnapshot.entityId, accessSnapshot.ethAddress, accessSnapshot.timestamp, `[${accessSnapshot.pointers.join(',')}]`)
                    console.log(accessErrors)
                    if (overwriteEntity) {
                        console.log(' * The entity was already overwritten by: ' + overwriteEntity.id)
                        const overwritePointers: string[] = overwriteEntity ? overwriteEntity.pointers : []
                        if (arraysEqual(overwritePointers, accessSnapshot.pointers)) {
                            console.log(' * The Overwrite entity has the same pointers!!!')
                        } else {
                            console.log(' * The Overwrite entity has DIFFERENT pointers!!!')
                            console.log('   # Original  :', accessSnapshot.pointers)
                            console.log('   # Overwriter:', overwritePointers)
                        }
                    } else {
                        console.log(' * The entity is STILL ACTIVE.')
                    }

                }
            }))
            console.log(`Scene Solved Errors: ${sceneSolvedErrors}`)
            console.log('------------------------------\n')
        }

        const profileAccessSnapshots = accessSnapshots.filter(accessSnapshot => accessSnapshot.entityType===EntityType.PROFILE)

        if (countProfilesByUser) {
            console.log('------------------------------')
            console.log('Counting Profiles by user...')
            console.log('------------------------------')
            const failedProfilesByUser: AssociativeArray<AccessSnapshot> = groupBy(profileAccessSnapshots, 'ethAddress')
            countAndSort(failedProfilesByUser).forEach(item => console.log(`  ${item.key}: ${item.count}`))
            console.log('------------------------------\n')
        }

        if (countProfilesByTimestamp) {
            console.log('------------------------------')
            console.log('Counting Profiles by timestamp...')
            console.log('------------------------------')
            const MILLIS_IN_DAY = ms('1d')
            const failedProfilesByTime: AssociativeArray<AccessSnapshot> = groupBy(profileAccessSnapshots.map(s => roundTimestampInAccessSnapshot(s, MILLIS_IN_DAY)), 'timestamp')
            countAndSort(failedProfilesByTime).forEach(item => console.log(`  ${item.key} (${new Date(parseInt(item.key)).toISOString()}): ${item.count}`))
            console.log('------------------------------\n')
        }

        if (checkProfilesAccess) {
            console.log('------------------------------')
            console.log('Checking Profiles access...')
            console.log('------------------------------')
            let accessErrorsCount = 0
            await Promise.all(profileAccessSnapshots.map(async accessSnapshot => {
                const accessErrors: string[] = await accessChecker.hasAccess(accessSnapshot.entityType, accessSnapshot.pointers, accessSnapshot.timestamp, accessSnapshot.ethAddress)
                if (accessErrors.length > 0) {
                    console.log(` => ${accessSnapshot.entityId}: Invalid`, accessSnapshot.entityType, accessSnapshot.ethAddress, accessSnapshot.timestamp)
                    console.log(accessErrors)
                    accessErrorsCount++
                }
            }))
            console.log(`Access Errors Count: ${accessErrorsCount}`)
            console.log('------------------------------\n')
        }

        if (validateProfilesSignatures) {
            console.log('------------------------------')
            console.log('Validating Profiles signatures...')
            console.log('------------------------------')
            const contentAuthenticator = new ContentAuthenticator()
            const httpProvider = httpProviderForNetwork("mainnet")
            let authErrorsCount = 0
            for(let i=0; i<profileAccessSnapshots.length; i++) {
                const snapshot = profileAccessSnapshots[i]
                console.log(` => ${snapshot.entityId}:`, snapshot.ethAddress, snapshot.timestamp)
                const validationResult: ValidationResult = await contentAuthenticator.validateSignature(snapshot.entityId, snapshot.authChain, httpProvider, snapshot.timestamp)
                if (!validationResult.ok) {
                    console.log(`    => ${snapshot.entityId}: Invalid`, snapshot.ethAddress, snapshot.timestamp, validationResult.message)
                    authErrorsCount++
                }
            }
            console.log(`Auth Errors Count: ${authErrorsCount}`)
            console.log('------------------------------\n')
        }

        }, MAX_SAFE_TIMEOUT)

    fit('Entity access check', async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), 'https://api.thegraph.com/subgraphs/name/nicosantangelo/watchtower');
        const accessSnapshot = {
            pointers: ["55,-132"],
            ethAddress: '0xaabe0ecfaf9e028d63cf7ea7e772cf52d662691a',
            timestamp: 1582392484732,
            type: EntityType.SCENE
        }
        const accessErrors: string[] = await accessChecker.hasAccess(accessSnapshot.type, accessSnapshot.pointers, accessSnapshot.timestamp, accessSnapshot.ethAddress)
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

function notEmpty<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}

// type KeyType = string | number
interface AssociativeArray<V> {
    [key: string]: V[];
}

function isAssociativeIndex<T>(value: T | null | undefined | string | number): value is string|number {
    return value !== null && value !== undefined && (typeof value === "string" || typeof value === "number")
}

function groupBy<K extends keyof V, V>(items: V[], groupingProperty: K): AssociativeArray<V> {
    return items.reduce(function(rv: AssociativeArray<V>, x: V) {
        const index = x[groupingProperty];
        if (isAssociativeIndex(index)) {
            (rv[index] = rv[index] || []).push(x);
        }
      return rv;
    }, {});
};

function countAndSort<V>(associativeArray: AssociativeArray<V>, ascending: boolean = true): {key:string, count:number}[] {
    let array: {key:string, count:number}[] = []
    for(let key in associativeArray) {
        array.push({key, count:associativeArray[key].length})
    }
    array.sort((a,b) => ascending? a.count-b.count : b.count-a.count)
    return array
}

const serverDomains = {
    '02c7e319-3fd7-4bf4-9764-b7bf1feea490': 'peer.decentraland.org',
    '0b447141-540a-42dd-a579-3d95e6e83259': 'interconnected.online',
    '4bb3deae-3f3b-4ac0-8f55-4a1633b3a6b0': 'www.decentraland.club',
    '1d052409-af2e-4d3f-be3c-5eaf0ef0be46': 'peer.decentral.games',
    '84c62f6c-1af5-41cc-a26c-5bcf742d814b': 'peer.kyllian.me',
    'fd21f05a-6804-4b6f-9669-39fc4e6f42a0': 'peer.uadevops.com',
    '19fa85d1-d92f-4e32-ac17-879d9b945736': 'peer-wc1.decentraland.org',
    '2b235332-2e10-4d07-9966-b95efb6146ec': 'peer.melonwave.com',
    '7173c4be-ac32-4662-b5f2-eff6ce28f84e': 'interconnected.online',
    '47827f19-dfe7-4662-a6f8-48cdd9c078d7': 'interconnected.online',
}

function getServerContentBaseUrl(serverName: string): string {
    const serverDomain: string = serverDomains[serverName] ?? 'peer.decentraland.org'
    return `https://${serverDomain}/content`
}

type AccessSnapshot = {
    entityType: EntityType,
    entityId: EntityId,
    pointers: Pointer[],
    ethAddress: EthAddress,
    timestamp: Timestamp,
    authChain: AuthChain,
    overwrittenBy: string | undefined,
}

const LOCAL_STORAGE_FOR_ACCESS_SNAPSHOTS = '/tmp/failed-deployments-access-snapshots'
async function getAccessSnapshot(serverDomain: string, entityType: EntityType, entityId: EntityId): Promise<AccessSnapshot | undefined>{
    const localCopyFile = `${LOCAL_STORAGE_FOR_ACCESS_SNAPSHOTS}/${entityId}`
    if (fs.existsSync(localCopyFile)) {
        return JSON.parse(fs.readFileSync(localCopyFile).toString())
    }
    const serverBaseUrl = getServerContentBaseUrl(serverDomain)
    const entity: Entity | undefined = await fetchEntity(serverBaseUrl, entityType, entityId)
    const audit: AuditInfo | undefined = await fetchAuditInfo(serverBaseUrl, entityType, entityId)
    if (entity && audit) {
        const accessSnapshot: AccessSnapshot = {
            entityType,
            entityId,
            pointers: entity.pointers,
            ethAddress: audit.authChain[0].payload,
            timestamp: entity.timestamp,
            authChain: audit.authChain,
            overwrittenBy: audit.overwrittenBy,
        }
        if (!fs.existsSync(LOCAL_STORAGE_FOR_ACCESS_SNAPSHOTS)){
            fs.mkdirSync(LOCAL_STORAGE_FOR_ACCESS_SNAPSHOTS);
        }
        fs.writeFileSync(localCopyFile, JSON.stringify(accessSnapshot))
        return accessSnapshot
    }
    console.log('ERROR: Can not retrieve Access Snapshot for:', serverDomain, entityType, entityId)
    return undefined
}

async function fetchEntity(serverBaseUrl: string, entityType: EntityType, entityId: EntityId): Promise<Entity | undefined> {
    return await fetchFirst(`${serverBaseUrl}/entities/${entityType}?id=${entityId}`)
}

async function fetchAuditInfo(serverBaseUrl: string, entityType: EntityType, entityId: EntityId): Promise<AuditInfo | undefined> {
    return await fetchObject(`${serverBaseUrl}/audit/${entityType}/${entityId}`)
}

function roundTimestamp(timestamp: Timestamp, millis: number): Timestamp {
    return Math.round(timestamp / millis) * millis
}
function roundTimestampInAccessSnapshot(accessSnapshot: AccessSnapshot, millis: number): AccessSnapshot {
    return {...accessSnapshot, timestamp: roundTimestamp(accessSnapshot.timestamp, millis)}
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

function arraysEqual<T>(array1: T[], array2: T[]) {
    return array1.length == array2.length && array1.every( function(item,i) { return item == array2[i] } )
}
