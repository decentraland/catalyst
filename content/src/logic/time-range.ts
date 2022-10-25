export type TimeRange = {
  initTimestamp: number
  endTimestamp: number
}

export type TimeRangeDivision = {
  intervals: TimeRange[]
  remainder: TimeRange
}

export function intervalSizeLabel(timeRange: TimeRange) {
  const diff = timeRangeSizeInMS(timeRange)
  switch (diff) {
    case MS_PER_DAY:
      return 'day'
    case MS_PER_WEEK:
      return 'week'
    case MS_PER_MONTH:
      return 'month'
    case MS_PER_YEAR:
      return 'year'
    default:
      return 'unknown'
  }
}

export function timeRangeSizeInMS(timeRange: TimeRange): number {
  // throw if end > init
  return timeRange.endTimestamp - timeRange.initTimestamp
}

export const MS_PER_DAY = 86_400_000
export const MS_PER_WEEK = 7 * MS_PER_DAY
export const MS_PER_MONTH = 4 * MS_PER_WEEK
export const MS_PER_YEAR = 12 * MS_PER_MONTH

/**
 * @param timerange interval to be covered by @timeRanges
 * @param timeRanges intervals to cover @timerange
 * @returns true if the sum of all the intervals in timeRanges together cover the interval of timerange. Overlaps can occur.
 * EXAMPLE 1
 *  Input:
 *    - timerange: [t1, t2]
 *    - timeRanges: [[t1, t1 + 5], [t1 + 5, t2]]
 *  Result: True, as the sum of all the elements in timeRanges cover the interval of timerange.
 *
 * EXAMPLE 2
 *  Input:
 *    - timerange: [t1, t2]
 *    - timeRanges: [[t1, t1 + 2], [t1 + 4, t2]]
 *  Result: False, as the interval between [t1 + 2, t1 + 4] is not covered.
 *
 * EXAMPLE 3
 *  Input:
 *    - timerange: [t1, t2]
 *    - timeRanges: [[t1, t1 + 6], [t1 + 5, t2]]
 *  Result: True, even though as the intervals in timeRanges are overlapped, the sum of all the elements in timeRanges cover the interval of timerange.
 *
 * EXAMPLE 4
 *  Input:
 *    - timerange: [t1, t2]
 *    - timeRanges: [[t1 - 1, t1 + 5], [t1 + 5, t2 + 3]]
 *  Result: True, even though the sum of all the elements in timeRanges extends the limits of timerange, it strictly contains it.
 */
export function isTimeRangeCoveredBy(timerange: TimeRange, timeRanges: TimeRange[]) {
  if (timeRanges.length == 0) return false
  const minTimestamp = timeRanges[0].initTimestamp
  let currentMaxTimestamp = timeRanges[0].endTimestamp
  for (const t of timeRanges) {
    if (t.initTimestamp > currentMaxTimestamp) {
      return false
    }
    currentMaxTimestamp = Math.max(currentMaxTimestamp, t.endTimestamp)
  }
  return minTimestamp <= timerange.initTimestamp && currentMaxTimestamp >= timerange.endTimestamp
}

export function divideTimeInYearsMonthsWeeksAndDays(timeRange: TimeRange): TimeRangeDivision {
  // assert end >= init
  const timeSizeMS = timeRangeSizeInMS(timeRange)
  const intervalSizes = [MS_PER_YEAR, MS_PER_MONTH, MS_PER_WEEK, MS_PER_DAY]
  const intervals: TimeRange[] = []
  let remainingTimeSizeMS = timeSizeMS
  let initInterval = timeRange.initTimestamp
  for (const [idx, intervalSize] of intervalSizes.entries()) {
    const numberOfIntervalsOfNextSizeInCurrentSize = Math.floor(intervalSize / (intervalSizes[idx + 1] ?? intervalSize))
    while (
      remainingTimeSizeMS >=
      // here we check there is enough time to create a block of the current group
      numberOfIntervalsOfNextSizeInCurrentSize * (intervalSizes[idx + 1] ?? intervalSize) +
        // now we check the next groups have at least one level complete before creating the current one
        (intervalSizes[idx + 1] ?? 0) +
        (intervalSizes[idx + 2] ?? 0) +
        (intervalSizes[idx + 3] ?? 0)
    ) {
      const endInterval = initInterval + intervalSize
      intervals.push({ initTimestamp: initInterval, endTimestamp: endInterval })
      initInterval = endInterval
      remainingTimeSizeMS = remainingTimeSizeMS - intervalSize
    }
  }
  return {
    intervals,
    remainder: {
      initTimestamp: initInterval,
      endTimestamp: timeRange.endTimestamp
    }
  }
}
