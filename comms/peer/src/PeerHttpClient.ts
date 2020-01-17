import { PeerHeaders } from "./peerjs-server-connector/enums";

interface PeerRequestInit extends RequestInit {
  bodyObject?: object;
}

export class PeerHttpClient {
  constructor(private lighthouseUrl: string, private tokenProvider: () => string) {}

  async fetch(urlOrPath: string, init?: PeerRequestInit): Promise<{ response: Response; json: any }> {
    let actualUrl = urlOrPath;

    try {
      new URL(actualUrl);
    } catch (e) {
      actualUrl = this.lighthouseUrl + actualUrl;
    }

    const actualInit: RequestInit = {
      ...init,
      body: init?.body ?? (init?.bodyObject ? JSON.stringify(init.bodyObject) : undefined),
      headers: { ...init?.headers, "Content-Type": "application/json", [PeerHeaders.PeerToken]: this.tokenProvider() }
    };

    const response = await fetchOrThrow(actualUrl, actualInit);

    const json = await response.json();

    return { response, json };
  }
}

export async function fetchOrThrow(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status > 400) {
    const responseJson = await response.json();
    throw new Error(`Error performing request to ${JSON.stringify(input)} with method ${init?.method ?? "GET"}. Status: ${responseJson?.status}`);
  }

  return response;
}
