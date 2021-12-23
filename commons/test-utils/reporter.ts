import { SpecReporter, StacktraceOption } from 'jasmine-spec-reporter'

export const reporter = new SpecReporter({
  summary: {
    displayDuration: true,
    displayStacktrace: StacktraceOption.PRETTY
  },
  spec: {
    displayStacktrace: StacktraceOption.RAW,
    displayDuration: true
  }
})

export const installReporter = (): void => {
  jasmine.getEnv().clearReporters()
  jasmine.getEnv().addReporter(reporter)
}
