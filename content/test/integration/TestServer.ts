import fetch from "node-fetch"
import FormData from "form-data"
import { Server } from "@katalyst/content/Server"
import { Environment, EnvironmentConfig } from "@katalyst/content/Environment"
import { ServerAddress, ContentServerClient } from "@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient"
import { EntityType, Pointer, EntityId } from "@katalyst/content/service/Entity"
import { ControllerEntity } from "@katalyst/content/controller/Controller"
import { DeploymentHistory } from "@katalyst/content/service/history/HistoryManager"
import { ContentFileHash } from "@katalyst/content/service/Hashing"
import { DeployData, hashAndSignMessage, Identity } from "./E2ETestUtils"
import { ContentFile, ServerStatus } from "@katalyst/content/service/Service"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { AuditInfo } from "@katalyst/content/service/audit/Audit"
import { getClient } from "@katalyst/content/service/synchronization/clients/contentserver/ActiveContentServerClient"
import { buildEntityTarget, BlacklistTarget, buildContentTarget } from "@katalyst/content/blacklist/BlacklistTarget"

/** A wrapper around a server that helps make tests more easily */
export class TestServer extends Server {

    private serverPort: number
    private started: boolean = false
    public readonly namePrefix: string
    public readonly storageFolder: string

    private readonly client: ContentServerClient

    constructor(env: Environment) {
        super(env)
        this.serverPort = env.getConfig(EnvironmentConfig.SERVER_PORT)
        this.namePrefix = env.getConfig(EnvironmentConfig.NAME_PREFIX)
        this.storageFolder = env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER)
        this.client = getClient(this.getAddress(), this.namePrefix, 0)
    }

    getAddress(): ServerAddress {
        return `http://localhost:${this.serverPort}`
    }

    start(): Promise<void> {
        this.started = true
        return super.start()
    }

    stop(): Promise<void> {
        if (this.started) {
            return super.stop()
        } else {
            return Promise.resolve()
        }
    }

    async deploy(deployData: DeployData): Promise<Timestamp> {
        const form = new FormData();
        form.append('entityId'  , deployData.entityId)
        form.append('ethAddress', deployData.ethAddress)
        form.append('signature' , deployData.signature)
        deployData.files.forEach((f: ContentFile) => form.append(f.name, f.content, { filename: f.name }))

        const deployResponse = await fetch(`${this.getAddress()}/entities`, { method: 'POST', body: form })
        expect(deployResponse.ok).toBe(true)

        const { creationTimestamp } = await deployResponse.json()
        return creationTimestamp
    }

    getActivePointers(type: EntityType): Promise<Pointer[]> {
        return this.makeRequest(`${this.getAddress()}/pointers/${type}`)
    }

    async getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<ControllerEntity[]> {
        const filterParam = pointers.map(pointer => `pointer=${pointer}`).join("&")
        return this.makeRequest(`${this.getAddress()}/entities/${type}?${filterParam}`)
    }

    getHistory(): Promise<DeploymentHistory> {
        return this.makeRequest(`${this.getAddress()}/history`)
    }

    getStatus(): Promise<ServerStatus> {
        return this.client.getStatus()
    }

    getEntitiesByIds(type: string, ...ids: EntityId[]): Promise<ControllerEntity[]> {
        const filterParam = ids.map(id => `id=${id}`).join("&")
        return this.makeRequest(`${this.getAddress()}/entities/${type}?${filterParam}`)
    }

    async getEntityById(type: string, id: EntityId): Promise<ControllerEntity> {
        const entities: ControllerEntity[] = await this.getEntitiesByIds(type, id)
        expect(entities.length).toEqual(1)
        expect(entities[0].id).toEqual(id)
        return entities[0]
    }

    async downloadContent(fileHash: ContentFileHash): Promise<Buffer> {
        const response = await fetch(`${this.getAddress()}/contents/${fileHash}`);
        if (response.ok) {
            return await response.buffer();
        }

        throw new Error(`Failed to fetch file with hash ${fileHash}`)
    }

    async getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo> {
        return this.client.getAuditInfo(type, id)
    }

    blacklistEntity(entity: ControllerEntity, identity: Identity): Promise<void> {
        const entityTarget = buildEntityTarget(EntityType[entity.type.toUpperCase().trim()], entity.id)
        return this.blacklistTarget(entityTarget, identity)
    }

    unblacklistEntity(entity: ControllerEntity, identity: Identity): Promise<void> {
        const entityTarget = buildEntityTarget(EntityType[entity.type.toUpperCase().trim()], entity.id)
        return this.unblacklistTarget(entityTarget, identity)
    }

    async blacklistContent(fileHash: ContentFileHash, identity: Identity): Promise<void> {
        const contentTarget = buildContentTarget(fileHash)
        return this.blacklistTarget(contentTarget, identity)
    }

    private async blacklistTarget(target: BlacklistTarget, identity: Identity) {
        const timestamp = Date.now()
        const [address, signature] = hashAndSignMessage(`${target.asString()}${timestamp}`, identity)

        const body = {
            "timestamp": timestamp,
            "blocker": address,
            "signature": signature
        }

        const deployResponse = await fetch(`${this.getAddress()}/blacklist/${target.getType()}/${target.getId()}`, { method: 'PUT', body: JSON.stringify(body), headers: {"Content-Type": "application/json"} })
        expect(deployResponse.ok).toBe(true)
    }

    private async unblacklistTarget(target: BlacklistTarget, identity: Identity) {
        const timestamp = Date.now()
        const [address, signature] = hashAndSignMessage(`${target.asString()}${timestamp}`, identity)
        const query = `blocker=${address}&timestamp=${timestamp}&signature=${signature}`
        const deployResponse = await fetch(`${this.getAddress()}/blacklist/${target.getType()}/${target.getId()}?${query}`, { method: 'DELETE', headers: {"Content-Type": "application/json"} })
        expect(deployResponse.ok).toBe(true)
    }

    private async makeRequest(url: string): Promise<any> {
        const response = await fetch(url)
        expect(response.ok).toBe(true)
        return response.json();
    }

}