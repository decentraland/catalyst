export function fetchJSON(url: string, ...args: any[]) {
  return fetch(url, ...args).then((res: any) => res.json());
}
