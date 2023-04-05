import { TimeRange } from '@dcl/snapshots-fetcher/dist/types'
import { divideTimeInYearsMonthsWeeksAndDays, intervalSizeLabel, isTimeRangeCoveredBy, MS_PER_DAY, MS_PER_MONTH, MS_PER_WEEK, MS_PER_YEAR, timeRangeSizeInMS } from '../../../src/logic/time-range'

it('should return correct interval size labels', () => {
  expect(intervalSizeLabel({ initTimestamp: 0, endTimestamp: MS_PER_DAY })).toEqual('day')
  expect(intervalSizeLabel({ initTimestamp: 0, endTimestamp: MS_PER_WEEK })).toEqual('week')
  expect(intervalSizeLabel({ initTimestamp: 0, endTimestamp: MS_PER_MONTH })).toEqual('month')
  expect(intervalSizeLabel({ initTimestamp: 0, endTimestamp: MS_PER_YEAR })).toEqual('year')
  expect(intervalSizeLabel({ initTimestamp: 0, endTimestamp: MS_PER_YEAR + 1 })).toEqual('unknown')
})

it('time range should be covered by others', () => {
  const weeklyTimeRangeToBeCovered: TimeRange = {
    initTimestamp: 1640995200000, // 2022-01-01 00:00:00 GMT
    endTimestamp: 1641600000000 // 2022-01-08 00:00:00 GMT, 7 days later
  }
  // 7 days
  const dailyTimeRanges: TimeRange[] = [
    { initTimestamp: 1640995200000, endTimestamp: 1641081600000 },
    { initTimestamp: 1641081600000, endTimestamp: 1641168000000 },
    { initTimestamp: 1641168000000, endTimestamp: 1641254400000 },
    { initTimestamp: 1641254400000, endTimestamp: 1641340800000 },
    { initTimestamp: 1641340800000, endTimestamp: 1641427200000 },
    { initTimestamp: 1641427200000, endTimestamp: 1641513600000 },
    { initTimestamp: 1641513600000, endTimestamp: 1641600000000 },
  ]
  expect(isTimeRangeCoveredBy(weeklyTimeRangeToBeCovered, dailyTimeRanges)).toBeTruthy()
})

it('time range should not be covered by others', () => {
  const weeklyTimeRangeToBeCovered: TimeRange = {
    initTimestamp: 1640995200000, // 2022-01-01 00:00:00 GMT
    endTimestamp: 1641600000000 // 2022-01-08 00:00:00 GMT, 7 days later
  }
  // 6 days
  const dailyTimeRanges: TimeRange[] = [
    { initTimestamp: 1640995200000, endTimestamp: 1641081600000 },
    { initTimestamp: 1641081600000, endTimestamp: 1641168000000 },
    { initTimestamp: 1641168000000, endTimestamp: 1641254400000 },
    { initTimestamp: 1641254400000, endTimestamp: 1641340800000 },
    { initTimestamp: 1641340800000, endTimestamp: 1641427200000 },
    { initTimestamp: 1641427200000, endTimestamp: 1641513600000 }
  ]
  expect(isTimeRangeCoveredBy(weeklyTimeRangeToBeCovered, dailyTimeRanges)).toBeFalsy()
})

it('time range should not be covered by others when there is a gap', () => {
  const weeklyTimeRangeToBeCovered: TimeRange = {
    initTimestamp: 1640995200000, // 2022-01-01 00:00:00 GMT
    endTimestamp: 1641600000000 // 2022-01-08 00:00:00 GMT, 7 days later
  }
  // The time range [2022-01-04 00:00:00 GMT, 2022-01-05 00:00:00 GMT] is not covered
  const dailyTimeRanges: TimeRange[] = [
    { initTimestamp: 1640995200000, endTimestamp: 1641254400000 }, // [2022-01-01 00:00:00 GMT, 2022-01-04 00:00:00 GMT]
    { initTimestamp: 1641340800000, endTimestamp: 1641600000000 }, // [2022-01-05 00:00:00 GMT, 2022-01-08 00:00:00 GMT]
  ]
  expect(isTimeRangeCoveredBy(weeklyTimeRangeToBeCovered, dailyTimeRanges)).toBeFalsy()
})

it('should split a 2 days and 50 seconds timerange in 2 days and a remainder of 50 seconds', () => {
  const timeRange: TimeRange = {
    initTimestamp: 1640995200000, // 2022-01-01 00:00:00 GMT
    endTimestamp: 1641168000000 + 50000 // 2022-01-03 00:00:50 GMT, 2 days and 50 seconds later
  }
  const timeRangeDivision = divideTimeInYearsMonthsWeeksAndDays(timeRange)
  expect(timeRangeDivision.intervals.length).toEqual(2)
  for (const dailyInterval of timeRangeDivision.intervals) {
    expect(timeRangeSizeInMS(dailyInterval)).toBe(MS_PER_DAY)
  }
  expect(timeRangeDivision.intervals[0]).toEqual({
    initTimestamp: 1640995200000, // 2022-01-01 00:00:00 GMT
    endTimestamp: 1641081600000 // 2022-01-02 00:00:00 GMT
  })
  expect(timeRangeDivision.intervals[1]).toEqual({
    initTimestamp: 1641081600000, // 2022-01-02 00:00:00 GMT
    endTimestamp: 1641168000000 // 2022-01-03 00:00:00 GMT
  })
  expect(timeRangeSizeInMS(timeRangeDivision.remainder)).toEqual(50000)
  expect(timeRangeDivision.remainder).toEqual({
    initTimestamp: 1641168000000, // 2022-01-03 00:00:00 GMT
    endTimestamp: 1641168050000 // 2022-01-03 00:00:50 GMT
  })
})

function expectTimeDivisionMatchesRepresentation(timeRange: TimeRange, representation: string) {
  const timeRangeDivision = divideTimeInYearsMonthsWeeksAndDays(timeRange)
  const intervals = timeRangeDivision.intervals
  let received = ""
  for (const interval of intervals) {
    switch (timeRangeSizeInMS(interval)) {
      case MS_PER_DAY:
        received = received + 'I'
        break
      case MS_PER_WEEK:
        received = received + 'W'
        break
      case MS_PER_MONTH:
        received = received + 'M'
        break
      case MS_PER_YEAR:
        received = received + 'Y'
        break
      default:
        received = received + '-'
    }
  }
  expect(received).toEqual(representation)
  // Now we assert that the intervals and remainder covers correctly the time range
  if (intervals.length > 0) {
    expect(intervals[0].initTimestamp).toEqual(timeRange.initTimestamp)
    expect(timeRangeDivision.remainder.endTimestamp).toEqual(timeRange.endTimestamp)
    // Now we assert the intervals are consecutive
    let previousEndTimestampSecs = intervals[0].initTimestamp
    for (const interval of intervals) {
      expect(interval.initTimestamp).toEqual(previousEndTimestampSecs)
      previousEndTimestampSecs = interval.endTimestamp
    }
    expect(timeRangeDivision.remainder.initTimestamp).toEqual(intervals[intervals.length - 1].endTimestamp)
  }

}

it('should satisfy progression', () => {
  // I = Day, W = Week, M = Month, Y = Year
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 1), 'I')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 7), 'IIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 8), 'WI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 14), 'WIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 15), 'WWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 21), 'WWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 22), 'WWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 28), 'WWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 29), 'WWWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 34), 'WWWWIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 35), 'WWWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 36), 'MWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 42), 'MWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 43), 'MWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 49), 'MWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 50), 'MWWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 56), 'MWWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 57), 'MWWWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 63), 'MWWWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 64), 'MMWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 364), 'MMMMMMMMMMMMWWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 365), 'MMMMMMMMMMMMWWWWI')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 370), 'MMMMMMMMMMMMWWWWIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 371), 'MMMMMMMMMMMMWWWWIIIIIII')
  expectTimeDivisionMatchesRepresentation(timeRangeOfDays(1640995200000, 372), 'YMWI')
})

function timeRangeOfDays(timestampSecsStartingAt: number, numberOfDays: number): TimeRange {
  return {
    initTimestamp: timestampSecsStartingAt,
    endTimestamp: timestampSecsStartingAt + MS_PER_DAY * numberOfDays
  }
}
