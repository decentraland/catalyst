import fs from "fs"
import path from "path"
import FormData from "form-data"
import fetch from "node-fetch"
import { EntityType, Pointer, Entity } from "../service/Entity"
import { Hashing, ContentFileHash } from "../service/Hashing"
import { Timestamp, ContentFile } from "../service/Service"
import { ControllerEntityFactory } from "../controller/ControllerEntityFactory"
import { ControllerEntity } from "../controller/Controller"

async function run(argv: string[]) {
    if (argv.length < 5 || argv.length > 6) {
        console.log("Welcome to the dir uploader!!!")
        console.log("Usage:   {} = required, [] = optional")
        console.log("bazel run content:upload {SERVER_ADDRESS} {ENTITY_TYPE} {POINTERS} {ENTITY_TIMESTAMP} {ENTITY_METADATA} [UPLOAD_DIR]")
    } else {
        const serverAddress = argv[0]
        const type: EntityType = EntityType[argv[1].toUpperCase().trim()]
        const pointers: Pointer[] = argv[2].split(";")
        const timestamp: Timestamp = (argv[3].toLowerCase() == "now") ? Date.now() : parseInt(argv[3])
        const metadata = argv[4]
        let content: Map<string, ContentFileHash> = new Map()
        let filesToUpload: ContentFile[] = []
        const uploadDir = argv[5]

        if (uploadDir) {
            const filesNamesInDir = fs.readdirSync(uploadDir)
            const files = filesNamesInDir.map(fileName => {
                const filePath = path.join(uploadDir, fileName)
                const content = fs.readFileSync(filePath)
                return { name: fileName, content }
            })
            const hashes: Map<ContentFileHash, ContentFile> = await Hashing.calculateHashes(files)
            for (const [hash, file] of hashes.entries()) {
                content.set(file.name, hash)
                filesToUpload.push(file)
            }
        }

        const [entity, entityFile] = await buildControllerEntityAndFile('entity.json', type, pointers, timestamp, content, metadata)
        filesToUpload.push(entityFile)

        const form = new FormData();
        form.append('entityId'  , entity.id)
        form.append('ethAddress', "ETH_ADD")
        form.append('signature' , "SIG")
        filesToUpload.forEach(f => {
            form.append(f.name, f.content, {
                filename: f.name,
            });
        })

        const deployResponse = await fetch(`http://${serverAddress}/entities`, { method: 'POST', body: form })
        if (!deployResponse.ok) {
            throw new Error("Response note ok")
        }
    }
}

async function buildControllerEntityAndFile(fileName: string, type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: Map<string, ContentFileHash>, metadata?: any): Promise<[ControllerEntity, ContentFile]> {
    const [entity, file]: [Entity, ContentFile] = await buildEntityAndFile(fileName, type, pointers, timestamp, content, metadata)
    return [ControllerEntityFactory.maskEntity(entity), file]
}

async function buildEntityAndFile(fileName: string, type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: Map<string, ContentFileHash>, metadata?: any): Promise<[Entity, ContentFile]> {

    const entity: Entity = new Entity("temp-id", type, pointers, timestamp, content, metadata)
    const file: ContentFile = entityToFile(entity, fileName)
    const fileHash: ContentFileHash = await Hashing.calculateHash(file)
    const entityWithCorrectId = new Entity(fileHash, entity.type, entity.pointers, entity.timestamp, entity.content, entity.metadata)
    return [entityWithCorrectId, file]
}

/** Build a file with the given entity as the content */
function entityToFile(entity: Entity, fileName?: string): ContentFile {
    let copy: any = Object.assign({}, entity)
    copy.content = !copy.content || !(copy.content instanceof Map) ? copy.content :
        Array.from(copy.content.entries()).map(([key, value]) => ({ file: key, hash: value }))
    delete copy.id
    return { name: fileName ?? "name", content: Buffer.from(JSON.stringify(copy)) }
}

run(process.argv.slice(2)).then(() => console.log("Done!"))