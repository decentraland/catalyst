import fs from "fs"
import path from "path"
import * as EthCrypto from "eth-crypto"
import { buildControllerEntityAndFile } from "../controller/ControllerEntityTestFactory"
import { Authenticator } from "../../src/service/auth/Authenticator"
import { Pointer, EntityType } from "../../src/service/Entity"
import { ControllerEntity } from "../../src/controller/Controller"
import { FileHash, Hashing } from "../../src/service/Hashing"
import { ENTITY_FILE_NAME, File } from "../../src/service/Service"
import { DAOClient } from "../../src/service/synchronization/clients/DAOClient"
import { EnvironmentConfig, Bean, EnvironmentBuilder } from "../../src/Environment"
import { MockedContentAnalytics } from "../service/analytics/MockedContentAnalytics"
import { MockedAccessChecker } from "../service/access/MockedAccessChecker"
import { TestServer } from "./TestServer"

export function buildDeployData(pointers: Pointer[], metadata: any, ...contentPaths: string[]): Promise<[DeployData, ControllerEntity]> {
    return buildDeployDataAfterEntity(pointers, metadata, undefined, ...contentPaths)
}

export async function buildDeployDataAfterEntity(pointers: Pointer[], metadata: any, afterEntity?: ControllerEntity, ...contentPaths: string[]): Promise<[DeployData, ControllerEntity]> {
    const files: File[] = contentPaths.map(filePath => ({ name: path.basename(filePath), content: fs.readFileSync(filePath) }))

    const hashes: Map<FileHash, File> = await Hashing.calculateHashes(files)
    const content: Map<string, string> = new Map(Array.from(hashes.entries())
        .map(([hash, file]) => [file.name, hash]))

    const [entity, entityFile] = await buildControllerEntityAndFile(
        ENTITY_FILE_NAME,
        EntityType.SCENE,
        pointers,
        (afterEntity?.timestamp ?? Date.now()) + 1,
        content,
        metadata)

    const identity = EthCrypto.createIdentity();
    const messageHash = Authenticator.createEthereumMessageHash(entity.id)

    const deployData: DeployData = {
        entityId: entity.id,
        ethAddress: identity.address,
        signature: EthCrypto.sign(identity.privateKey, messageHash),
        files: [ entityFile, ...files]
    }

    return [deployData, entity]
}

export function deleteServerStorage(...servers: TestServer[]) {
    servers.map(server => server.storageFolder)
        .forEach(storageFolder => deleteFolderRecursive(storageFolder))
}

function deleteFolderRecursive(pathToDelete: string) {
    if (fs.existsSync(pathToDelete)) {
        fs.readdirSync(pathToDelete).forEach((file, index) => {
            const curPath = path.join(pathToDelete, file);
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(pathToDelete);
    }
}

export function buildBaseEnv(namePrefix: string, port: number, syncInterval: number, daoClient: DAOClient): EnvironmentBuilder {
    return new EnvironmentBuilder()
        .withConfig(EnvironmentConfig.NAME_PREFIX, namePrefix)
        .withConfig(EnvironmentConfig.SERVER_PORT, port)
        .withConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, "storage_" + namePrefix)
        .withConfig(EnvironmentConfig.LOG_REQUESTS, false)
        .withConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL, syncInterval)
        .withConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, syncInterval)
        .withBean(Bean.DAO_CLIENT, daoClient)
        .withAnalytics(new MockedContentAnalytics())
        .withAccessChecker(new MockedAccessChecker())
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export type DeployData = {
    entityId: string,
    ethAddress: string,
    signature: string,
    files: File[]
}