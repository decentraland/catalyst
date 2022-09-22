export type TimeRange = {
  initTimestampSecs: number
  endTimestampSecs: number
}

export type TimeRangeDivision = {
  intervals: TimeRange[]
  remainder: TimeRange
}

export function intervalSizeLabel(timeRange: TimeRange) {
  const diff = timeRangeSizeInSeconds(timeRange)
  switch (diff) {
    case SECONDS_PER_DAY:
      return 'day'
    case SECONDS_PER_WEEK:
      return 'week'
    case SECONDS_PER_MONTH:
      return 'month'
    case SECONDS_PER_YEAR:
      return 'year'
    default:
      return 'unknown'
  }
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

function divideTimeRangeInSubintervals(timeRange: TimeRange, intervalSizeSeconds: number): TimeRangeDivision {
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

export function divideTimeRange(timeRange: TimeRange): TimeRangeDivision {
  // assert end >= init
  const timeSizeInSeconds = timeRangeSizeInSeconds(timeRange)
  const intervalSizes = [SECONDS_PER_YEAR, SECONDS_PER_MONTH, SECONDS_PER_WEEK, SECONDS_PER_DAY]
  const intervals: TimeRange[] = []
  let remainingTimeSize = timeSizeInSeconds
  let initInterval = timeRange.initTimestampSecs
  function addNewIntervalOfSize(intervalSizeSecs: number) {
    const endInterval = initInterval + intervalSizeSecs
    intervals.push({ initTimestampSecs: initInterval, endTimestampSecs: endInterval })
    initInterval = endInterval
    remainingTimeSize = remainingTimeSize - intervalSizeSecs
  }
  for (const [idx, intervalSize] of intervalSizes.entries()) {
    if (idx == intervalSizes.length - 1) {
      while (remainingTimeSize >= intervalSizes[idx]) {
        addNewIntervalOfSize(intervalSizes[idx])
      }
    } else {
      const numberOfIntervalsOfNextSizeInCurrentSize = Math.floor(intervalSize / intervalSizes[idx + 1])
      while (
        remainingTimeSize >=
        (numberOfIntervalsOfNextSizeInCurrentSize + 1) * intervalSizes[idx + 1] +
          (idx + 2 < intervalSizes.length ? intervalSizes[idx + 2] : 0) +
          (idx + 3 < intervalSizes.length ? intervalSizes[idx + 3] : 0)
      ) {
        addNewIntervalOfSize(intervalSize)
      }
    }
  }
  return {
    intervals,
    remainder: {
      initTimestampSecs: initInterval,
      endTimestampSecs: timeRange.endTimestampSecs
    }
  }
}
