import { Environment, Bean } from "../../Environment"
import { HistoryManager } from "./HistoryManager"
import { HistoryManagerImpl } from "./HistoryManagerImpl"


export class HistoryManagerFactory {

    static create(env: Environment): HistoryManager {
        return new HistoryManagerImpl(env.getBean(Bean.CONTENT_CLUSTER))
    }
}
