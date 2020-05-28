
export class ReadyStateService {
  private ready: boolean = false

  isReady() {
    return this.ready
  }

}


type StateCheck = {
  name: string,
  call: () => Promise<boolean>
}