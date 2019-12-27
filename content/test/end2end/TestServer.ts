import fetch from "node-fetch"
import FormData from "form-data"
import { Server } from "../../src/Server"
import { Environment, EnvironmentConfig } from "../../src/Environment"
import { ServerAddress } from "../../src/service/synchronization/clients/ContentServerClient"
import { EntityType, Pointer, EntityId } from "../../src/service/Entity"
import { ControllerEntity } from "../../src/controller/Controller"
import { DeploymentHistory } from "../../src/service/history/HistoryManager"
import { FileHash } from "../../src/service/Hashing"
import { DeployData } from "./TestUtils"
import { Timestamp, File } from "../../src/service/Service"
import { AuditInfo } from "../../src/service/audit/Audit"

/** A wrapper around a server that helps make tests more easily */
export class TestServer extends Server {

    private serverPort: number
    private started: boolean = false
    public readonly namePrefix: string
    public readonly storageFolder: string

    constructor(env: Environment) {
        super(env)
        this.serverPort = env.getConfig(EnvironmentConfig.SERVER_PORT)
        this.namePrefix = env.getConfig(EnvironmentConfig.NAME_PREFIX)
        this.storageFolder = env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER)
    }

    getAddress(): ServerAddress {
        return `localhost:${this.serverPort}`
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
        deployData.files.forEach((f: File) => form.append(f.name, f.content, { filename: f.name }))

        const deployResponse = await fetch(`http://${this.getAddress()}/entities`, { method: 'POST', body: form })
        expect(deployResponse.ok).toBe(true)

        const { creationTimestamp } = await deployResponse.json()
        return creationTimestamp
    }

    getActivePointers(type: EntityType): Promise<Pointer[]> {
        return this.makeRequest(`http://${this.getAddress()}/pointers/${type}`)
    }

    async getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<ControllerEntity[]> {
        const filterParam = pointers.map(pointer => `pointer=${pointer}`).join("&")
        return this.makeRequest(`http://${this.getAddress()}/entities/${type}?${filterParam}`)
    }

    getHistory(): Promise<DeploymentHistory> {
        return this.makeRequest(`http://${this.getAddress()}/history`)
    }

    getEntitiesByIds(type: EntityType, ...ids: EntityId[]): Promise<ControllerEntity[]> {
        const filterParam = ids.map(id => `id=${id}`).join("&")
        return this.makeRequest(`http://${this.getAddress()}/entities/${type}?${filterParam}`)
    }

    async getEntityById(type: EntityType, id: EntityId): Promise<ControllerEntity> {
        const entities: ControllerEntity[] = await this.getEntitiesByIds(type, id)
        expect(entities.length).toEqual(1)
        expect(entities[0].id).toEqual(id)
        return entities[0]
    }

    async downloadContent(fileHash: FileHash): Promise<Buffer> {
        const response = await fetch(`http://${this.getAddress()}/contents/${fileHash}`)
        expect(response.ok).toBe(true)
        return response.buffer()
    }

    async getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo> {
        return this.makeRequest(`http://${this.getAddress()}/audit/${type}/${id}`)
    }

    private async makeRequest(url: string): Promise<any> {
        const response = await fetch(url)
        expect(response.ok).toBe(true)
        return response.json();
    }

}