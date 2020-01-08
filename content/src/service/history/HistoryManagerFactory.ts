import { Environment, Bean } from "../../Environment"
import { HistoryManager } from "./HistoryManager"
import { HistoryStorage } from "./HistoryStorage"
import { HistoryManagerImpl } from "./HistoryManagerImpl"


export class HistoryManagerFactory {

    static create(env: Environment): Promise<HistoryManager> {
        const storage: HistoryStorage = new HistoryStorage(env.getBean(Bean.STORAGE))
        return HistoryManagerImpl.build(storage)
    }
}
