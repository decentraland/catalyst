import { SimpleStorage } from "./simpleStorage";

export type ConfigKeyValue = {
  key: string;
  value?: any;
};

export class ConfigService {
  private storage: SimpleStorage;

  constructor(storage: SimpleStorage) {
    this.storage = storage;
  }

  async updateConfigs(configs: ConfigKeyValue[]) {
    await Promise.all(
      configs.map(async (it) => {
        if (typeof it.value !== "undefined") {
          await this.storage.setString(it.key, JSON.stringify(it.value));
        } else {
          await this.storage.deleteKey(it.key);
        }
      })
    );
    return await this.getConfig();
  }

  async getConfig() {
    const items = await this.storage.getAll();
    Object.keys(items).forEach((key) => (items[key] = JSON.parse(items[key])));
    return items;
  }

  async get(key: string, ifNotPresent: () => any): Promise<any> {
    const item = await this.storage.getString(key);
    return typeof item !== "undefined" ? JSON.parse(item) : ifNotPresent();
  }

  async getMaxPeersPerLayer(): Promise<number | undefined> {
    return await this.get("maxPeersPerLayer", () => parseInt(process.env.MAX_PER_LAYER ?? "50"))
  }
}
