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
