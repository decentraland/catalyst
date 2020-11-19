module.exports = config => {
  config.set({
    logLevel: config.LOG_INFO,
    colors: true,
    reporters: ["spec", "mocha"],
    specReporter: {
      //   maxLogLines: 5, // limit number of lines logged per test
      suppressErrorSummary: false, // do not print error summary
      suppressFailed: false, // do not print information about failed tests
      suppressPassed: false, // do not print information about passed tests
      suppressSkipped: false, // do not print information about skipped tests
      showSpecTiming: true, // print the time elapsed for each spec
      failFast: true // test would finish with error when a first fail occurs.
    },
    plugins: ["karma-spec-reporter", "karma-mocha-reporter"],
    client: {
      jasmine: {
        timeoutInterval: 60000
      }
    }
  });
};
