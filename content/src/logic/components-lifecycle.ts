// FILE TAKEN FROM well-known-components/interfaces AS IS

import { IBaseComponent } from '@well-known-components/interfaces'

export function stopAllComponents(components: Record<string, any>) {
  const pending: PromiseLike<any>[] = []
  for (let c in components) {
    const component = components[c]
    if (component.stop && typeof component.stop == 'function') {
      pending.push(component.stop())
    }
  }
  return Promise.all(pending)
}

// gracefully finalizes all the components on SIGTERM
function bindStopService(components: Record<string, IBaseComponent>) {
  process.on('SIGTERM', () => {
    process.stdout.write('<<< SIGTERM received >>>\n')
    stopAllComponents(components)
      .then(() => process.exit())
      .catch((e) => {
        process.stderr.write(e + '\n')
        console.error(e)
        process.exit(1)
      })
  })
}

async function allSettled(promises: Array<Promise<any> | PromiseLike<any>>) {
  let mappedPromises = promises.map((p) => {
    let r = p.then((value: any) => {
      return {
        status: 'fulfilled',
        value
      }
    })

    if ('catch' in p) {
      r = p.catch((reason) => {
        return {
          status: 'rejected',
          reason
        }
      })
    }

    return r
  })
  return Promise.all(mappedPromises)
}

// gracefully finalizes all the components on SIGTERM
export async function startComponentsLifecycle(components: Record<string, IBaseComponent>): Promise<void> {
  process.stdout.write('<<< Starting components >>>\n')
  const pending: Set<PromiseLike<any>> = new Set()

  let mutStarted = false
  let mutLive = false

  const immutableStartOptions: IBaseComponent.ComponentStartOptions = {
    started() {
      return mutStarted
    },
    live() {
      return mutLive
    },
    getComponents() {
      return components
    }
  }

  for (let c in components) {
    const component = components[c]
    if ((await components[c]) !== components[c]) {
      process.stderr.write(
        "<<< Error initializing components. Component '" +
          c +
          "' is a Promise, it should be an object, did you miss an await in the initComponents?. >>>\n"
      )
    }
    if (component.start && typeof component.start == 'function') {
      const awaitable = component.start(immutableStartOptions)
      if (awaitable && typeof awaitable == 'object' && 'then' in awaitable) {
        awaitable.toString = function () {
          return c
        }
        awaitable.then(() => pending.delete(awaitable))
        pending.add(awaitable)
        if (awaitable.catch) {
          // avoid unhanled catch error messages in node.
          // real catch happens below in `Promise.all(pending)`
          awaitable.catch(() => void 0)
        }
      }
    }
  }

  // application started
  mutLive = true

  bindStopService(components)

  if (pending.size == 0) return

  function print() {
    if (pending.size) {
      process.stdout.write(`<<< Pending components: [${Array.from(pending).join(',')}] >>>\n`)
      setTimeout(print, 100)
    }
  }

  setTimeout(print, 100)

  try {
    await Promise.all(pending)
    mutStarted = true
  } catch (e) {
    process.stderr.write('<<< Error initializing components. Stopping components and closing application. >>>\n')
    await allSettled(Array.from(pending))
    throw e
  }
}
