import { SynchronizationManager } from "@katalyst/content/service/synchronization/SynchronizationManager";

export class MockedSynchronizationManager implements SynchronizationManager {

    start(): Promise<void> {
        return Promise.resolve()
    }

    stop(): Promise<void> {
        return Promise.resolve()
    }
}