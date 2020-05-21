import fs from "fs"
import path from "path"
import * as EthCrypto from "eth-crypto"
import { Pointer, EntityType } from "@katalyst/content/service/Entity"
import { ControllerEntity } from "@katalyst/content/controller/Controller"
import { ContentFileHash, Hashing } from "@katalyst/content/service/Hashing"
import { ContentFile } from "@katalyst/content/service/Service"
import { buildControllerEntityAndFile } from "@katalyst/test-helpers/controller/ControllerEntityTestFactory"
import { Authenticator, EthAddress } from "dcl-crypto"
import { retry } from "@katalyst/content/helpers/RetryHelper"

export function buildDeployDataWithIdentity(pointers: Pointer[], metadata: any, identity: Identity, ...contentPaths: string[]): Promise<[DeployData, ControllerEntity]> {
    return buildDeployDataInternal(pointers, metadata, contentPaths, identity)
}

export function buildDeployData(pointers: Pointer[], metadata: any, ...contentPaths: string[]): Promise<[DeployData, ControllerEntity]> {
    return buildDeployDataInternal(pointers, metadata, contentPaths, createIdentity())
}

export async function buildDeployDataAfterEntity(pointers: Pointer[], metadata: any, afterEntity: ControllerEntity, ...contentPaths: string[]): Promise<[DeployData, ControllerEntity]> {
    return buildDeployDataInternal(pointers, metadata, contentPaths, createIdentity(), afterEntity)
}

async function buildDeployDataInternal(pointers: Pointer[], metadata: any, contentPaths: string[], identity: Identity, afterEntity?: ControllerEntity): Promise<[DeployData, ControllerEntity]> {
    const files: ContentFile[] = contentPaths.map(filePath => ({ name: path.basename(filePath), content: fs.readFileSync(filePath) }))

    const hashes: Map<ContentFileHash, ContentFile> = await Hashing.calculateHashes(files)
    const content: Map<string, string> = new Map(Array.from(hashes.entries())
        .map(([hash, file]) => [file.name, hash]))

    const [entity, entityFile] = await buildControllerEntityAndFile(
        EntityType.SCENE,
        pointers.map(pointer => pointer.toLocaleLowerCase()),
        Math.max(Date.now(), afterEntity?.timestamp ?? 0 + 1),
        content.size > 0 ? content : undefined,
        metadata)

    const [address, signature] = hashAndSignMessage(entity.id, identity)

    const deployData: DeployData = {
        entityId: entity.id,
        ethAddress: address,
        signature: signature,
        files: [ entityFile, ...files]
    }

    return [deployData, entity]
}

export function parseEntityType(entity: ControllerEntity) {
    return EntityType[entity.type.toUpperCase().trim()]
}

export function hashAndSignMessage(message: string, identity: Identity = createIdentity()) {
    const messageHash = Authenticator.createEthereumMessageHash(message)
    const signature = EthCrypto.sign(identity.privateKey, messageHash)
    return [identity.address, signature]
}

export function createIdentity(): Identity {
    return EthCrypto.createIdentity()
}

export function deleteFolderRecursive(pathToDelete: string) {
    if (fs.existsSync(pathToDelete)) {
        fs.readdirSync(pathToDelete).forEach((file) => {
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

export function awaitUntil(evaluation: () => Promise<any>, attempts: number = 10, waitBetweenAttempts: string = '1s'): Promise<void> {
    return retry(evaluation, attempts, 'perform assertion', waitBetweenAttempts)
}

export type DeployData = {
    entityId: string,
    ethAddress: string,
    signature: string,
    files: ContentFile[]
}

export type Identity = {
    address: EthAddress,
    privateKey: string,
}