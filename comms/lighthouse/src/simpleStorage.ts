import fs from "fs";
import os from "os";

export class SimpleStorage {
  private _currentItems: object = {};

  constructor(private filePath: string) {}

  async getCurrentItems() {
    if (!this._currentItems) {
      let itemsJson: string | null = null;
      try {
        itemsJson = await fs.promises.readFile(this.filePath, "utf-8");
      } catch (err) {
        console.log("No server storage could be opened. Starting new one.");
      }

      this._currentItems = itemsJson ? JSON.parse(itemsJson) : {};
    }

    return this._currentItems;
  }

  async getString(key: string) {
    const currentItems = await this.getCurrentItems();

    return currentItems[key] as string;
  }

  async getOrSetString(key: string, value: string) {
    const currentItems = await this.getCurrentItems();
    if(typeof currentItems[key] === 'undefined') {
      currentItems[key] = value;
      //@ts-ignore We want to call flush but not await it
      const ignored = this.flush(currentItems);
    }

    return currentItems[key] as string;
  }

  async setString(key: string, value: string) {
    const currentItems = await this.getCurrentItems();

    currentItems[key];

    //@ts-ignore We want to call flush but not await it
    const ignored = this.flush(currentItems);
  }

  private async flush(items: object) {
    try {
      await fs.promises.writeFile(
        this.filePath,
        JSON.stringify(items),
        "utf-8"
      );
    } catch (err) {
      console.log("Error writing storage file " + this.filePath, err);
    }
  }
}

const localDir = `${os.homedir()}/.lighthouse`

if (!fs.existsSync(localDir)){
  fs.mkdirSync(localDir);
}

export const serverStorage = new SimpleStorage(localDir + "/serverStorage.json")
