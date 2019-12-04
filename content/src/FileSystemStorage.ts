import { ContentStorage } from "./ContentStorage";
import * as fs from 'fs';

export class FileSystemStorage implements ContentStorage {
    root:string
    
    constructor(root:string ) { 
       this.root = root
       // TODO: Validate root is a valid directory
       // TODO: Avoid trailing slashes in root
    } 

    async store(category: string, id: string, content: Buffer): Promise<void> {
        let categoryDir = this.getDir(category);
        await (fs.existsSync(categoryDir) ? Promise.resolve() : fs.promises.mkdir(categoryDir));
        return await fs.promises.writeFile(this.getFile(category, id), content);
    }    
    
    getContent(category: string, id: string): Promise<Buffer> {
        return fs.promises.readFile(this.getFile(category, id))
    }
    
    listIds(category: string): Promise<string[]> {
        return fs.promises.readdir(this.getDir(category))
    }
    
    async exists(category: string, id: string): Promise<boolean> {
        const stats = await fs.promises.stat(this.getFile(category, id));
        return stats ? true : false;
    }

    private getDir(category: string): string {
        return this.root + '/' + category
    }
    private getFile(category: string, id: string): string {
        return this.getDir(category) + '/' + id
    }
}
