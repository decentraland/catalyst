import { DEFAULT_ID_ALPHABET } from '@dcl/catalyst-node-commons'

export type IdServiceConfig = {
  alphabet: string
  idLength: number
}

export class IdService {
  private currentIdIndex: number = 0

  public config: IdServiceConfig

  constructor(config: Partial<IdServiceConfig> = {}) {
    this.config = {
      alphabet: config.alphabet ?? DEFAULT_ID_ALPHABET,
      idLength: config.idLength ?? 3
    }
  }

  nextId(): string {
    let id = ''
    let rest: number = this.currentIdIndex
    this.currentIdIndex += 1
    for (let i = 0; i < this.config.idLength; i++) {
      const currentAlphabetIndex = rest % this.config.alphabet.length
      rest = Math.floor(rest / this.config.alphabet.length)

      id = this.config.alphabet[currentAlphabetIndex] + id
    }

    return id
  }
}
