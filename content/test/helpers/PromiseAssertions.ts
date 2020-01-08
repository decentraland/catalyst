
export function assertPromiseIsRejected(promiseExecution: () => Promise<any>) {
    assertPromiseRejectionGeneric(promiseExecution, () => { })
}

export function assertPromiseRejectionIs(promiseExecution: () => Promise<any>, errorMessage: string) {
    assertPromiseRejectionGeneric(promiseExecution, returnedMessage => expect(returnedMessage).toBe(errorMessage))
}

function assertPromiseRejectionGeneric(promiseExecution: () => Promise<any>, evaluation: (error: string) => void) {
    promiseExecution()
        .then(() => { throw new Error("Expected an error, but nothing failed") })
        .catch(error => evaluation(error.message))
}