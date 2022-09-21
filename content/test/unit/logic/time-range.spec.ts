import { divideTimeInYearsMonthsWeeksAndDays, divideTimeRangeInDays, divideTimeRangeInMonths, divideTimeRangeInWeeks, divideTimeRangeInYears, intervalSizeLabel, isTimeRangeCoveredBy, SECONDS_PER_DAY, SECONDS_PER_MONTH, SECONDS_PER_WEEK, SECONDS_PER_YEAR, TimeRange, timeRangeSizeInSeconds } from '../../../src/logic/time-range'

it('should split a 2 days and 50 seconds timerange in 2 days and a remainder of 50 seconds', () => {
  const timeRange: TimeRange = {
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1641168000 + 50 // 2022-01-03 00:00:50 GMT, 2 days and 50 seconds later
  }
  const timeRangeDivision = divideTimeRangeInDays(timeRange)
  expect(timeRangeDivision.intervals.length).toEqual(2)
  for (const dailyInterval of timeRangeDivision.intervals) {
    expect(timeRangeSizeInSeconds(dailyInterval)).toBe(SECONDS_PER_DAY)
  }
  expect(timeRangeDivision.intervals[0]).toEqual({
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1641081600 // 2022-01-02 00:00:00 GMT
  } as TimeRange)
  expect(timeRangeDivision.intervals[1]).toEqual({
    initTimestampSecs: 1641081600, // 2022-01-02 00:00:00 GMT
    endTimestampSecs: 1641168000 // 2022-01-03 00:00:00 GMT
  } as TimeRange)
  expect(timeRangeSizeInSeconds(timeRangeDivision.remainder)).toEqual(50)
  expect(timeRangeDivision.remainder).toEqual({
    initTimestampSecs: 1641168000, // 2022-01-03 00:00:00 GMT
    endTimestampSecs: 1641168050 // 2022-01-03 00:00:50 GMT
  } as TimeRange)
})

it('should split a 8 days timerange in 1 week and a remainder of 1 day', () => {
  const timeRange: TimeRange = {
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1641686400 // 2022-01-09 00:00:00 GMT, 8 days later
  }
  const timeRangeDivision = divideTimeRangeInWeeks(timeRange)
  expect(timeRangeDivision.intervals.length).toEqual(1)
  expect(timeRangeSizeInSeconds(timeRangeDivision.intervals[0])).toEqual(SECONDS_PER_WEEK)
  expect(timeRangeDivision.intervals[0]).toEqual({
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1641600000 // 2022-01-08 00:00:00 GMT
  } as TimeRange)
  expect(timeRangeSizeInSeconds(timeRangeDivision.remainder)).toEqual(SECONDS_PER_DAY)
  expect(timeRangeDivision.remainder).toEqual({
    initTimestampSecs: 1641600000, // 2022-01-08 00:00:00 GMT
    endTimestampSecs: 1641686400 // 2022-01-09 00:00:00 GMT
  } as TimeRange)
})

it('should split a 30 days timerange in 1 month (28 days) and a remainder of 2 day', () => {
  const timeRange: TimeRange = {
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1643587200 // 2022-01-31 00:00:00 GMT, 30 days later
  }
  const timeRangeDivision = divideTimeRangeInMonths(timeRange)
  expect(timeRangeDivision.intervals.length).toEqual(1)
  expect(timeRangeSizeInSeconds(timeRangeDivision.intervals[0])).toEqual(SECONDS_PER_MONTH)
  expect(timeRangeDivision.intervals[0]).toEqual({
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1643414400 // 2022-01-29 00:00:00 GMT
  } as TimeRange)
  expect(timeRangeSizeInSeconds(timeRangeDivision.remainder)).toEqual(2 * SECONDS_PER_DAY)
  expect(timeRangeDivision.remainder).toEqual({
    initTimestampSecs: 1643414400, // 2022-01-29 00:00:00 GMT
    endTimestampSecs: 1643587200 // 2022-01-31 00:00:00 GMT
  } as TimeRange)
})

it('should split a 722 days timerange in two years and a remainder of 50 days', () => {
  // const secondsPerDay = 86_400
  const timeRange: TimeRange = {
    // 2022-01-01 00:00:00 GMT
    initTimestampSecs: 1640995200,
    // 2022-12-24 00:00:00 GMT, 722 days later (722 = 2 * 336 + 50)
    endTimestampSecs: 1703376000
  }

  const expectedFirstYear: TimeRange = {
    // 2022-01-01 00:00:00 GMT
    initTimestampSecs: timeRange.initTimestampSecs,
    // 2022-12-03 00:00:00 GMT, 336 days later
    endTimestampSecs: 1670025600
  }

  const expectedSecondYear: TimeRange = {
    // 2022-12-03 00:00:00 GMT
    initTimestampSecs: expectedFirstYear.endTimestampSecs,
    // 2023-11-04 00:00:00 GMT, 336 days later
    endTimestampSecs: 1699056000
  }

  const expectedRemainder: TimeRange = {
    // 2023-11-04 00:00:00 GMT, 336 days later
    initTimestampSecs: expectedSecondYear.endTimestampSecs,
    // 2023-12-24 00:00:00 GMT, 336 days later
    endTimestampSecs: timeRange.endTimestampSecs
  }

  const timeRangeDivision = divideTimeRangeInYears(timeRange)
  expect(timeRangeDivision.intervals.length).toEqual(2)
  expect(timeRangeDivision.intervals[0]).toEqual(expectedFirstYear)
  expect(timeRangeDivision.intervals[1]).toEqual(expectedSecondYear)
  expect(timeRangeDivision.remainder).toEqual(expectedRemainder)
})

it('should split a 372 days timerange in one year, one month, one week, and one day', () => {
  const timeRange: TimeRange = {
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1673136000 // 2023-01-08 00:00:00 GMT, 372 days later
  }

  const timeRangeDivision = divideTimeInYearsMonthsWeeksAndDays(timeRange)
  expect(timeRangeDivision.intervals.length).toEqual(4)
  expect(timeRangeDivision.intervals[0]).toEqual({
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT,
    endTimestampSecs: 1670025600 // 2022-12-03 00:00:00 GMT, 336 days later
  } as TimeRange)
  expect(timeRangeDivision.intervals[1]).toEqual({
    initTimestampSecs: 1670025600, // 2022-12-03 00:00:00 GMT
    endTimestampSecs: 1672444800 // 2022-12-31 00:00:00 GMT, 28 days later
  } as TimeRange)
  expect(timeRangeDivision.intervals[2]).toEqual({
    initTimestampSecs: 1672444800, // 2022-12-31 00:00:00 GMT
    endTimestampSecs: 1673049600 // 2023-01-7 00:00:00 GMT, 7 days later
  } as TimeRange)
  expect(timeRangeDivision.intervals[3]).toEqual({
    initTimestampSecs: 1673049600, // 2023-01-7 00:00:00 GMT
    endTimestampSecs: 1673136000 // 2023-01-8 00:00:00 GMT, 1 day later
  } as TimeRange)
  expect(timeRangeDivision.remainder).toEqual({
    initTimestampSecs: 1673136000, // 2023-01-8 00:00:00 GMT
    endTimestampSecs: 1673136000 // 2023-01-8 00:00:00 GMT
  } as TimeRange)
})

it('should return correct interval size labels', () => {
  expect(intervalSizeLabel({ initTimestampSecs: 0, endTimestampSecs: SECONDS_PER_DAY })).toEqual('day')
  expect(intervalSizeLabel({ initTimestampSecs: 0, endTimestampSecs: SECONDS_PER_WEEK })).toEqual('week')
  expect(intervalSizeLabel({ initTimestampSecs: 0, endTimestampSecs: SECONDS_PER_MONTH })).toEqual('month')
  expect(intervalSizeLabel({ initTimestampSecs: 0, endTimestampSecs: SECONDS_PER_YEAR })).toEqual('year')
  expect(intervalSizeLabel({ initTimestampSecs: 0, endTimestampSecs: SECONDS_PER_YEAR + 1 })).toEqual('unknown')
})

it('time range should be covered by others', () => {
  const weeklyTimeRangeToBeCovered: TimeRange = {
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1641600000 // 2022-01-08 00:00:00 GMT, 7 days later
  }
  // 7 days
  const dailyTimeRanges: TimeRange[] = [
    { initTimestampSecs: 1640995200, endTimestampSecs: 1641081600 },
    { initTimestampSecs: 1641081600, endTimestampSecs: 1641168000 },
    { initTimestampSecs: 1641168000, endTimestampSecs: 1641254400 },
    { initTimestampSecs: 1641254400, endTimestampSecs: 1641340800 },
    { initTimestampSecs: 1641340800, endTimestampSecs: 1641427200 },
    { initTimestampSecs: 1641427200, endTimestampSecs: 1641513600 },
    { initTimestampSecs: 1641513600, endTimestampSecs: 1641600000 },
  ]
  expect(isTimeRangeCoveredBy(weeklyTimeRangeToBeCovered, dailyTimeRanges)).toBeTruthy()
})

it('time range should not be covered by others', () => {
  const weeklyTimeRangeToBeCovered: TimeRange = {
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1641600000 // 2022-01-08 00:00:00 GMT, 7 days later
  }
  // 6 days
  const dailyTimeRanges: TimeRange[] = [
    { initTimestampSecs: 1640995200, endTimestampSecs: 1641081600 },
    { initTimestampSecs: 1641081600, endTimestampSecs: 1641168000 },
    { initTimestampSecs: 1641168000, endTimestampSecs: 1641254400 },
    { initTimestampSecs: 1641254400, endTimestampSecs: 1641340800 },
    { initTimestampSecs: 1641340800, endTimestampSecs: 1641427200 },
    { initTimestampSecs: 1641427200, endTimestampSecs: 1641513600 }
  ]
  expect(isTimeRangeCoveredBy(weeklyTimeRangeToBeCovered, dailyTimeRanges)).toBeFalsy()
})
