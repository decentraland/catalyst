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

export function divideTimeInYearsMonthsWeeksAndDays(timeRange: TimeRange): TimeRangeDivision {
  // assert end >= init
  const timeSizeInSeconds = timeRangeSizeInSeconds(timeRange)
  const intervalSizes = [SECONDS_PER_YEAR, SECONDS_PER_MONTH, SECONDS_PER_WEEK, SECONDS_PER_DAY]
  const intervals: TimeRange[] = []
  let remainingTimeSize = timeSizeInSeconds
  let initInterval = timeRange.initTimestampSecs
  for (const [idx, intervalSize] of intervalSizes.entries()) {
    const numberOfIntervalsOfNextSizeInCurrentSize = Math.floor(intervalSize / (intervalSizes[idx + 1] ?? intervalSize))
    while (
      remainingTimeSize >=
      // here we check there is enough time to create a block of the current group
      numberOfIntervalsOfNextSizeInCurrentSize * (intervalSizes[idx + 1] ?? intervalSize) +
        // now we check the next groups have at least one level complete before creating the current one
        (intervalSizes[idx + 1] ?? 0) +
        (intervalSizes[idx + 2] ?? 0) +
        (intervalSizes[idx + 3] ?? 0)
    ) {
      const endInterval = initInterval + intervalSize
      intervals.push({ initTimestampSecs: initInterval, endTimestampSecs: endInterval })
      initInterval = endInterval
      remainingTimeSize = remainingTimeSize - intervalSize
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
