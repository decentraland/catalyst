import { Mutex, MutexInterface } from 'async-mutex';

export class Lock {
    private readonly mutex: Mutex;

    constructor() {
        this.mutex = new Mutex()
    }

    runExclusive<T>(execution: MutexInterface.Worker<T>): Promise<T> {
        return this.mutex.runExclusive(execution)
    }
}
