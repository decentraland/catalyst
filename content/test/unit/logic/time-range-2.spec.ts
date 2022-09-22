import { divideTimeRange, intervalSizeLabel, isTimeRangeCoveredBy, SECONDS_PER_DAY, SECONDS_PER_MONTH, SECONDS_PER_WEEK, SECONDS_PER_YEAR, TimeRange, TimeRangeDivision, timeRangeSizeInSeconds } from '../../../src/logic/time-range'

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
  const timeRangeDivision = divideTimeRange(timeRange)
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

function expectResult(expectJest: jest.Expect, timeRangeDivision: TimeRangeDivision, representation: string) {
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
      // expectJest(1).toEqual(0)
    }
  }
  expectJest(received).toEqual(representation)
}
describe('progression', () => {

  it('should split a 8 days timerange in 1 week and 1 days', () => {
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 1)), 'I')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 7)), 'IIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 8)), 'WI')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 14)), 'WIIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 15)), 'WWI')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 21)), 'WWIIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 22)), 'WWWI')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 28)), 'WWWIIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 29)), 'WWWWI')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 35)), 'WWWWIIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 36)), 'MWI')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 42)), 'MWIIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 43)), 'MWWI')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 49)), 'MWWIIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 50)), 'MWWWI')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 56)), 'MWWWIIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 57)), 'MWWWWI')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 63)), 'MWWWWIIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 64)), 'MMWI')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 364)), 'MMMMMMMMMMMMWWWIIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 365)), 'MMMMMMMMMMMMWWWWI')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 370)), 'MMMMMMMMMMMMWWWWIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 371)), 'MMMMMMMMMMMMWWWWIIIIIII')
    expectResult(expect, divideTimeRange(timeRangeFor(1640995200, 372)), 'YMWI')
  })
})

function timeRangeFor(timestampSecsStartingAt: number, numberOfDays: number): TimeRange {
  return {
    initTimestampSecs: timestampSecsStartingAt,
    endTimestampSecs: timestampSecsStartingAt + SECONDS_PER_DAY * numberOfDays
  }
}
