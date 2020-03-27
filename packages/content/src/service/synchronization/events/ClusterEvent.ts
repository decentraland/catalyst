export interface Listener<T> {
    (event: T): Promise<any>;
}

export interface Disposable {
    dispose();
}

export class ClusterEvent<T> {
    private listeners: Listener<T>[] = [];

    on = (listener: Listener<T>): Disposable => {
        this.listeners.push(listener);
        return {
            dispose: () => this.off(listener)
        };
    }

    off = (listener: Listener<T>) => {
        var callbackIndex = this.listeners.indexOf(listener);
        if (callbackIndex > -1) this.listeners.splice(callbackIndex, 1);
    }

    emit = async (event: T) => {
        /** Update any general listeners */
        await Promise.all(this.listeners.map((listener) => listener(event)));
    }

}