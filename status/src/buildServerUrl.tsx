export function buildContentServerUrl(server: string) {
  return `${server.startsWith('http') ? '' : 'https://'}${server}/content/`;
}
export function buildCommsServerUrl(server: string) {
  return `${server.startsWith('http') ? '' : 'https://'}${server}/comms/`;
}
export function buildLambdasServerUrl(server: string) {
  return `${server.startsWith('http') ? '' : 'https://'}${server}/lambdas/`;
}
