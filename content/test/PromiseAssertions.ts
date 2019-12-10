export function assertPromiseRejectionIs<T>(serviceCall: () => Promise<T>, errorMessage: string) {
    assertPromiseRejectionGeneric(serviceCall, returnedMessage => expect(returnedMessage).toBe(errorMessage))
}

export function assertPromiseRejectionContains<T>(serviceCall: () => Promise<T>, errorMessage: string) {
    assertPromiseRejectionGeneric(serviceCall, returnedMessage => expect(returnedMessage).toContain(errorMessage))
}

function assertPromiseRejectionGeneric<T>(serviceCall: () => Promise<T>, evaluation: (error: string) => void) {
    serviceCall()
        .then(() => { throw new Error("Expected an error, but nothing failed") })
        .catch(error =>evaluation(error.message))
}