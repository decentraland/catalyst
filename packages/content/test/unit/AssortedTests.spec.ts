describe("Assorted General Tests", () => {

    it(`Review try/catch effect on promise rejection`, async () => {
        try {
            await intermediateCall()
        } catch (error) {
            console.log("The error was catched")
        }
    })

    async function intermediateCall(): Promise<void> {
        await failingFunction(true)
    }

    async function failingFunction(fail: boolean): Promise<number> {
        if (fail) {
            throw new Error('Failing...')
        }
        return 1
    }
})