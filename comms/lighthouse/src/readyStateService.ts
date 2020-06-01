import ms from "ms";

const awaitContentServerEnabled = (process.env.AWAIT_CONTENT_SERVER ?? "true") === "true";
const internalContentServerURL = process.env.INTERNAL_CONTENT_SERVER_URL ?? "http://content-server:6969";

export class ReadyStateService {
  private static readonly INTERVAL = ms("10s");
  private static readonly MAX_FAILED_ATTEMPTS = 12;
  private readonly failedAttempts: Map<StateCheckName, number> = new Map();
  private readonly checks: Map<StateCheckName, () => Promise<boolean>>;
  private ready: boolean = false;

  constructor() {
    this.checks = new Map(stateChecks.map(({ name, execution }) => [name, execution]));
    if (this.checks.size > 0) {
      setTimeout(() => this.executeChecks(), ReadyStateService.INTERVAL);
    } else {
      this.ready = true;
    }
  }

  isReady() {
    return this.ready;
  }

  private async executeChecks() {
    const checksToExecute = Array.from(this.checks.entries());
    for (const [checkName, execution] of checksToExecute) {
      try {
        const isReady = await execution();
        if (isReady) {
          console.log(`Check ready '${checkName}'`);
          this.checks.delete(checkName);
        }
      } catch (error) {
        console.log(`Couldn't execute the state check '${checkName}'. Error was: ${error}`);
        const failedAttempts = (this.failedAttempts.get(checkName) ?? 0) + 1;
        if (failedAttempts >= ReadyStateService.MAX_FAILED_ATTEMPTS) {
          console.log(`Maxed out on failed attempts to check '${checkName}'`);
          this.checks.delete(checkName);
        } else {
          this.failedAttempts.set(checkName, failedAttempts);
        }
      }
    }
    if (this.checks.size === 0) {
      this.ready = true;
    } else {
      setTimeout(() => this.executeChecks(), ReadyStateService.INTERVAL);
    }
  }
}

type StateCheckName = string;

type StateCheck = {
  name: StateCheckName;
  execution: () => Promise<boolean>;
};

const awaitContentServerCheck: StateCheck = {
  name: "Content Server Bootstrapping",
  execution: async () => {
    const statusResponse = await fetch(`${internalContentServerURL}/status`, { timeout: ms("2s") } as any);
    if (statusResponse.ok) {
      const { synchronizationStatus } = await statusResponse.json();
      const { synchronizationState } = synchronizationStatus;
      return synchronizationState !== "Bootstrapping";
    }
    throw new Error(`Response not OK. Response status: ${statusResponse.status}`);
  },
};

const stateChecks: StateCheck[] = [];

// In the future we may want to convert this in a list or something like that
if (awaitContentServerEnabled) {
  stateChecks.push(awaitContentServerCheck);
}
