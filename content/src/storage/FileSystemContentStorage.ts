import { ContentStorage } from "./ContentStorage";
import * as fs from 'fs';

export class FileSystemContentStorage implements ContentStorage {
    private root:string
    
    constructor(root: string) { 
       this.root = root       
       // TODO: Validate root is a valid directory
       // TODO: Avoid trailing slashes in root
    } 

    async store(category: string, id: string, content: Buffer): Promise<void> {
        let categoryDir = this.getDirPath(category);
        if (!fs.existsSync(categoryDir)) {
            await fs.promises.mkdir(categoryDir);
        }
        return await fs.promises.writeFile(this.getFilePath(category, id), content);
    }

    async delete(category: string, id: string): Promise<void> {
        // TODO: Catch potential exception if file doesn't exist, and return better error message
        await fs.promises.unlink(this.getFilePath(category, id))
    }
    
    getContent(category: string, id: string): Promise<Buffer> {
        // TODO: Catch potential exception if file doesn't exist, and return better error message
        return fs.promises.readFile(this.getFilePath(category, id))
    }
    
    listIds(category: string): Promise<string[]> {
        return fs.promises.readdir(this.getDirPath(category))
    }
    
    async exists(category: string, id: string): Promise<boolean> {
        try {
            await fs.promises.access(this.getFilePath(category, id), fs.constants.F_OK | fs.constants.W_OK)
            return true
        } catch (error) {
            return false
        }
    }

    private getDirPath(category: string): string {
        return this.root + '/' + category
    }
    private getFilePath(category: string, id: string): string {
        return this.getDirPath(category) + '/' + id
    }
}
