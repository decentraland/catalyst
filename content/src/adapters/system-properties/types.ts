export type SystemProperty<T> = {
  key: string
  toString(value: T): string
  fromString(value: string): T
}

export type SystemProperties = {
  get<T>(property: SystemProperty<T>): Promise<T | undefined>
  set<T>(property: SystemProperty<T>, value: T): Promise<void>
}
