/**
 * Split by commas
 * Then trims every part
 * And removes the emtpy strings
 */
export function splitByCommaTrimAndRemoveEmptyElements(string: string): string[] {
  return (string ?? '')
    .trim()
    .toString()
    .split(/,/g)
    .map(($) => $.trim())
    .filter(($) => $ != '')
}
