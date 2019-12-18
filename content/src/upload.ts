import fs from "fs"
import path from "path"
import FormData from "form-data"
import fetch from "node-fetch"
import { EntityType, Pointer, Entity } from "./service/Entity"
import { Hashing, FileHash } from "./service/Hashing"
import { Timestamp, File } from "./service/Service"
import { ControllerEntityFactory } from "./controller/ControllerEntityFactory"
import { ControllerEntity } from "./controller/Controller"

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
        let content: Map<string, FileHash> = new Map()
        let filesToUpload: Set<File> = new Set()
        const uploadDir = argv[5]

        if (uploadDir) {
            const filesNamesInDir = fs.readdirSync(uploadDir)
            const files = filesNamesInDir.map(fileName => {
                const filePath = path.join(uploadDir, fileName)
                const content = fs.readFileSync(filePath)
                return { name: fileName, content }
            })
            const hashes: Map<FileHash, File> = await Hashing.calculateHashes(new Set(files))
            for (const [hash, file] of hashes.entries()) {
                content.set(file.name, hash)
                filesToUpload.add(file)
            }
        }

        const [entity, entityFile] = await buildControllerEntityAndFile('entity.json', type, pointers, timestamp, content, metadata)
        filesToUpload.add(entityFile)

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
    content?: Map<string, FileHash>, metadata?: any): Promise<[ControllerEntity, File]> {
    const [entity, file]: [Entity, File] = await buildEntityAndFile(fileName, type, pointers, timestamp, content, metadata)
    return [ControllerEntityFactory.maskEntity(entity), file]
}

async function buildEntityAndFile(fileName: string, type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: Map<string, FileHash>, metadata?: any): Promise<[Entity, File]> {

    const entity: Entity = new Entity("temp-id", type, pointers, timestamp, content, metadata)
    const file: File = entityToFile(entity, fileName)
    const fileHash: FileHash = await Hashing.calculateHash(file)
    entity.id = fileHash
    return [entity, file]
}

/** Build a file with the given entity as the content */
function entityToFile(entity: Entity, fileName?: string): File {
    let copy: any = Object.assign({}, entity)
    copy.content = !copy.content || !(copy.content instanceof Map) ? copy.content :
        Array.from(copy.content.entries()).map(([key, value]) => ({ file: key, hash: value }))
    delete copy.id
    return { name: fileName ?? "name", content: Buffer.from(JSON.stringify(copy)) }
}

run(process.argv.slice(2)).then(() => console.log("Done!"))