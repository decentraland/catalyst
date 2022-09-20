export type TimeRange = {
  initTimestampSecs: number
  endTimestampSecs: number
}

export type TimeRangeDivision = {
  intervals: TimeRange[]
  remainder: TimeRange
}

export function timeRangeSizeInSeconds(timeRange: TimeRange): number {
  // throw if end > init
  return timeRange.endTimestampSecs - timeRange.initTimestampSecs
}

export const SECONDS_PER_DAY = 86_400
export const SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY
export const SECONDS_PER_MONTH = 4 * SECONDS_PER_WEEK
export const SECONDS_PER_YEAR = 12 * SECONDS_PER_MONTH

export function divideTimeRangeInYears(timeRange: TimeRange): TimeRangeDivision {
  return divideTimeRangeInSubintervals(timeRange, SECONDS_PER_YEAR)
}

export function divideTimeRangeInMonths(timeRange: TimeRange): TimeRangeDivision {
  return divideTimeRangeInSubintervals(timeRange, SECONDS_PER_MONTH)
}

export function divideTimeRangeInWeeks(timeRange: TimeRange): TimeRangeDivision {
  return divideTimeRangeInSubintervals(timeRange, SECONDS_PER_WEEK)
}

export function divideTimeRangeInDays(timeRange: TimeRange): TimeRangeDivision {
  return divideTimeRangeInSubintervals(timeRange, SECONDS_PER_DAY)
}

export function divideTimeInYearsMonthsWeeksAndDays(timeRange: TimeRange): TimeRangeDivision {
  const intervals: TimeRange[] = []

  const { intervals: years, remainder: yearlyRemainder } = divideTimeRangeInYears(timeRange)
  for (const year of years) intervals.push(year)

  const { intervals: months, remainder: monthlyRemainder } = divideTimeRangeInMonths(yearlyRemainder)
  for (const month of months) intervals.push(month)

  const { intervals: weeks, remainder: weeklyRemainder } = divideTimeRangeInWeeks(monthlyRemainder)
  for (const week of weeks) intervals.push(week)

  const { intervals: days, remainder: dailyRemainder } = divideTimeRangeInDays(weeklyRemainder)
  for (const day of days) intervals.push(day)

  return {
    intervals,
    remainder: dailyRemainder
  }
}

export function divideTimeRangeInSubintervals(timeRange: TimeRange, intervalSizeSeconds: number): TimeRangeDivision {
  // assert timestamps are seconds
  let initInterval = timeRange.initTimestampSecs
  let endInterval = timeRange.initTimestampSecs + intervalSizeSeconds
  const intervals: TimeRange[] = []
  while (endInterval <= timeRange.endTimestampSecs) {
    intervals.push({ initTimestampSecs: initInterval, endTimestampSecs: endInterval })
    initInterval = endInterval
    endInterval += intervalSizeSeconds
  }
  return {
    intervals,
    remainder: {
      initTimestampSecs: initInterval,
      endTimestampSecs: timeRange.endTimestampSecs
    }
  }
}

export function isTimeRangeCoveredBy(timerange: TimeRange, timeRanges: TimeRange[]) {
  if (timeRanges.length == 0) return false
  const minTimestamp = timeRanges[0].initTimestampSecs
  let currentMaxTimestamp = timeRanges[0].endTimestampSecs
  for (const t of timeRanges) {
    if (t.initTimestampSecs > currentMaxTimestamp) {
      return false
    }
    currentMaxTimestamp = Math.max(currentMaxTimestamp, t.endTimestampSecs)
  }
  return minTimestamp <= timerange.initTimestampSecs && currentMaxTimestamp >= timerange.endTimestampSecs
}
