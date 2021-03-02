import ms from 'ms'

export class TimeRefreshedDataHolder<T> {
  private value: T
  private valuePromise: Promise<T>
  private lastUpdateCall: Date

  constructor(private readonly provider: () => Promise<T>, private readonly refreshTime: string) {}

  async get(): Promise<T> {
    if (!this.valuePromise) {
      await this.updateValue()
    }

    if (!this.value) {
      return await this.valuePromise
    } else {
      return this.value
    }
  }

  lastUpdate(): Date {
    return this.lastUpdateCall
  }

  private async updateValue() {
    try {
      this.valuePromise = this.provider()
      this.value = await this.valuePromise
      this.lastUpdateCall = new Date()
    } finally {
      setTimeout(() => this.updateValue(), ms(this.refreshTime))
    }
  }
}
