import fs from "fs"
import path from "path"
import * as EthCrypto from "eth-crypto"
import { buildControllerEntityAndFile } from "../controller/ControllerEntityTestFactory"
import { Validation } from "../../src/service/Validation"
import { Pointer, EntityType } from "../../src/service/Entity"
import { ControllerEntity } from "../../src/controller/Controller"
import { FileHash, Hashing } from "../../src/service/Hashing"
import { ENTITY_FILE_NAME, File } from "../../src/service/Service"

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
    const messageHash = Validation.createEthereumMessageHash(entity.id)

    const deployData: DeployData = {
        entityId: entity.id,
        ethAddress: identity.address,
        signature: EthCrypto.sign(identity.privateKey, messageHash),
        files: [ entityFile, ...files]
    }

    return [deployData, entity]
}

export function deleteFolderRecursive(pathToDelete: string) {
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

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export type DeployData = {
    entityId: string,
    ethAddress: string,
    signature: string,
    files: File[]
}