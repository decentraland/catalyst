import { SynchronizationManager } from "../../../../content/src/service/synchronization/SynchronizationManager";

export class MockedSynchronizationManager implements SynchronizationManager {

    start(): Promise<void> {
        return Promise.resolve()
    }

    stop(): Promise<void> {
        return Promise.resolve()
    }
}