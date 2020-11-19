export class TimeRefreshedDataHolder<T> {

    private value: T
    private valuePromise: Promise<T>

    constructor(private readonly provider: () => Promise<T>, private readonly refreshTime: number) { }

    async get(): Promise<T> {
        if (!this.valuePromise) {
            await this.updateValue()
        }
        return this.value
    }

    private async updateValue() {
        this.valuePromise = this.provider()
        this.value = await this.valuePromise
        setTimeout(() => this.updateValue(), this.refreshTime)
    }

}