import { divideTimeInYearsMonthsWeeksAndDays, intervalSizeLabel, isTimeRangeCoveredBy, SECONDS_PER_DAY, SECONDS_PER_MONTH, SECONDS_PER_WEEK, SECONDS_PER_YEAR, TimeRange, timeRangeSizeInSeconds } from '../../../src/logic/time-range'

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

it('should split a 2 days and 50 seconds timerange in 2 days and a remainder of 50 seconds', () => {
  const timeRange: TimeRange = {
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1641168000 + 50 // 2022-01-03 00:00:50 GMT, 2 days and 50 seconds later
  }
  const timeRangeDivision = divideTimeInYearsMonthsWeeksAndDays(timeRange)
  expect(timeRangeDivision.intervals.length).toEqual(2)
  for (const dailyInterval of timeRangeDivision.intervals) {
    expect(timeRangeSizeInSeconds(dailyInterval)).toBe(SECONDS_PER_DAY)
  }
  expect(timeRangeDivision.intervals[0]).toEqual({
    initTimestampSecs: 1640995200, // 2022-01-01 00:00:00 GMT
    endTimestampSecs: 1641081600 // 2022-01-02 00:00:00 GMT
  })
  expect(timeRangeDivision.intervals[1]).toEqual({
    initTimestampSecs: 1641081600, // 2022-01-02 00:00:00 GMT
    endTimestampSecs: 1641168000 // 2022-01-03 00:00:00 GMT
  })
  expect(timeRangeSizeInSeconds(timeRangeDivision.remainder)).toEqual(50)
  expect(timeRangeDivision.remainder).toEqual({
    initTimestampSecs: 1641168000, // 2022-01-03 00:00:00 GMT
    endTimestampSecs: 1641168050 // 2022-01-03 00:00:50 GMT
  })
})

function expectTimeDivisionMatchesRepresentation(timeRange: TimeRange, representation: string) {
  const timeRangeDivision = divideTimeInYearsMonthsWeeksAndDays(timeRange)
  const intervals = timeRangeDivision.intervals
  let received = ""
  for (const interval of intervals) {
    switch (timeRangeSizeInSeconds(interval)) {
      case SECONDS_PER_DAY:
        received = received + 'I'
        break
      case SECONDS_PER_WEEK:
        received = received + 'W'
        break
      case SECONDS_PER_MONTH:
        received = received + 'M'
        break
      case SECONDS_PER_YEAR:
        received = received + 'Y'
        break
      default:
        received = received + '-'
    }
  }
  expect(received).toEqual(representation)
  // Now we assert that the intervals and remainder covers correctly the time range
  if (intervals.length > 0) {
    expect(intervals[0].initTimestampSecs).toEqual(timeRange.initTimestampSecs)
    expect(timeRangeDivision.remainder.endTimestampSecs).toEqual(timeRange.endTimestampSecs)
    // Now we assert the intervals are consecutive
    let previousEndTimestampSecs = intervals[0].initTimestampSecs
    for (const interval of intervals) {
      expect(interval.initTimestampSecs).toEqual(previousEndTimestampSecs)
      previousEndTimestampSecs = interval.endTimestampSecs
    }
    expect(timeRangeDivision.remainder.initTimestampSecs).toEqual(intervals[intervals.length - 1].endTimestampSecs)
  }

}

it('should satisfy progression', () => {
  // I = Day, W = Week, M = Month, Y = Year
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 1), 'I')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 7), 'IIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 8), 'WI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 14), 'WIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 15), 'WWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 21), 'WWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 22), 'WWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 28), 'WWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 29), 'WWWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 34), 'WWWWIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 35), 'WWWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 36), 'MWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 42), 'MWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 43), 'MWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 49), 'MWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 50), 'MWWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 56), 'MWWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 57), 'MWWWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 63), 'MWWWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 64), 'MMWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 364), 'MMMMMMMMMMMMWWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 365), 'MMMMMMMMMMMMWWWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 370), 'MMMMMMMMMMMMWWWWIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 371), 'MMMMMMMMMMMMWWWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200, 372), 'YMWI')
})

function timeRangeOfDays(timestampSecsStartingAt: number, numberOfDays: number): TimeRange {
  return {
    initTimestampSecs: timestampSecsStartingAt,
    endTimestampSecs: timestampSecsStartingAt + SECONDS_PER_DAY * numberOfDays
  }
}
