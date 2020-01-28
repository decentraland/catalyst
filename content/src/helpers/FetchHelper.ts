import fetch from "node-fetch";

export class FetchHelper {

    static async fetchJson(url: string): Promise<any> {
        const response = await fetch(url);
        if (response.ok) {
            return response.json()
        } else {
            throw new Error(`Failed to fetch ${url}. Got status ${response.status}, ${response.statusText}`)
        }
    }

    static async fetchBuffer(url: string): Promise<Buffer> {
        const response = await fetch(url);
        if (response.ok) {
            return response.buffer()
        } else {
            throw new Error(`Failed to fetch ${url}. Got status ${response.status}, ${response.statusText}`)
        }
    }

}