// FILE TAKEN FROM well-known-components/interfaces AS IS

export function stopAllComponents(components: Record<string, any>) {
  const pending: PromiseLike<any>[] = []
  for (const c in components) {
    const component = components[c]
    if (component.stop && typeof component.stop == 'function') {
      pending.push(component.stop())
    }
  }
  return Promise.all(pending)
}
