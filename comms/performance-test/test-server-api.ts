export type TestResponse = {
  id: string;
  started?: number;
  finished?: number;
};

export class TestServerAPIClient {
  constructor(public serverUrl: string) {}

  async createTest(started: boolean): Promise<TestResponse> {
    const testResponse = await fetch(`${this.serverUrl}/test`, { method: "POST", body: JSON.stringify({ started }), headers: { "Content-Type": "application/json" } });
    const testJson = await testResponse.json();

    return testJson;
  }

  async finishTest(testId: string) {
    return await fetch(`${this.serverUrl}/test/${testId}/finish`, { method: "PUT" });
  }
}
