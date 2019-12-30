/**
 * Intersect two arrays. It'll do reference checking for objects (===)
 */
export function intersect(left: any[], right: any[]) {
  return right.filter(field => left.indexOf(field) > -1)
}
