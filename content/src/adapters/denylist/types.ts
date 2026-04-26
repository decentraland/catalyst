export type Denylist = {
  isDenylisted: (id: string) => boolean
  start?: () => Promise<void>
  stop?: () => Promise<void>
}
