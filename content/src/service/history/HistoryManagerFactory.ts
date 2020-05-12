import { Environment, Bean } from "../../Environment"
import { HistoryManager } from "./HistoryManager"
import { HistoryManagerImpl } from "./HistoryManagerImpl"


export class HistoryManagerFactory {

    static create(env: Environment): Promise<HistoryManager> {
        return HistoryManagerImpl.build(env.getBean(Bean.CONTENT_CLUSTER), env.getBean(Bean.REPOSITORY))
    }
}
