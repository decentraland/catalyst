/**
 * We will use this file to set global configs, such as test suit set up and tear down
 */

let jasmine_default_timeout

beforeAll(() => {
    jasmine_default_timeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000
})

afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = jasmine_default_timeout
})