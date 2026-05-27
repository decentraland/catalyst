export type Denylist = {
  isDenylisted: (id: string) => boolean
  reload: () => Promise<void>
}
