export function patchLog(name: string) {
  function patch(logMethod: 'info' | 'error' | 'log' | 'warn') {
    const originalMethod = console[logMethod]

    console[logMethod] = (message?: any, ...optionalParams: any[]) => {
      const args = [`[${name}][${logMethod}]`, message, ...optionalParams]
      originalMethod.apply(console, args)
    }
  }

  patch('info')
  patch('log')
  patch('error')
  patch('warn')
}
