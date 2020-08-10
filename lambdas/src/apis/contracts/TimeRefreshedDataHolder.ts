export class TimeRefreshedDataHolder<T> {

    private value: T

    constructor(private readonly provider: ()=>Promise<T>, private readonly refreshTime: number) { }

    async get(): Promise<T> {
        if (!this.value) {
            await this.updateValue()
        }
        return this.value
    }

    private async updateValue() {
        this.value = await this.provider()
        setTimeout(() => this.updateValue(), this.refreshTime)
    }

}