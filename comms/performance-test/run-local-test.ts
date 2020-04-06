import { spawn, ChildProcess } from "child_process";
import puppeteer, { Browser } from "puppeteer";
import treekill from "tree-kill";
import { runClients } from "./test-client";
import { TestServerAPIClient } from "./test-server-api";

require("isomorphic-fetch");

function bazelExec(command: string, label: string, env: object = {}) {
  const child = spawn(`yarn`, ["bazel", "run", command], {
    cwd: process.env.BUILD_WORKSPACE_DIRECTORY,
    env: { PATH: process.env.PATH, ...env }
  });

  child.stdout?.on("data", data => console.log(`\n[${label}]\n`, data.toString(), `[/${label}]\n`));

  return child;
}

async function killProcesses(...pids: number[]) {
  return Promise.all(
    pids.map(
      pid =>
        new Promise((resolve, reject) => {
          treekill(pid, err => {
            if (err) {
              reject(err);
            } else {
              resolve(err);
            }
          });
        })
    )
  );
}

function awaitOutput(process: ChildProcess, output: string) {
  return new Promise((resolve, reject) => {
    process.stdout?.on("data", data => {
      if (data.toString().includes(output)) {
        resolve();
      }
    });
  });
}

const devServer = bazelExec("//comms/performance-test/client:devserver", "DEVSERVER");
const resultsServer = bazelExec("//comms/performance-test/server", "RESULTS_SERVER");
const lighthouse = bazelExec("//comms/lighthouse:server", "LIGHTHOUSE", { NO_AUTH: "true" });

const killAllChildren = async (browsers: puppeteer.Browser[]) => {
  console.log("Test finished. Killing all processes");
  await Promise.all(browsers.map(it => it.close()));
  await killProcesses(devServer.pid, lighthouse.pid, resultsServer.pid);
};

const browserCount = parseInt(process.env.BROWSERS_COUNT ?? "10");

const resultsServerAPI = new TestServerAPIClient("http://localhost:9904");

(async () => {
  let browsers: Browser[] = [];
  try {
    await Promise.all([awaitOutput(devServer, "Server listening on"), awaitOutput(lighthouse, "Lighthouse listening on"), awaitOutput(resultsServer, "server listening on")]);

    console.log("Child process are listening");

    const test = await resultsServerAPI.createTest(true);

    const testId = test.id;

    console.log("Running test with id: " + testId);

    browsers = await runClients(browserCount, testId);

    await fetch(`http://localhost:9904/test/${testId}/finish`, { method: "PUT" });
    console.log(`Test ${testId} finished`);

    await killAllChildren(browsers);
    process.exit(0);
  } catch (e) {
    await killAllChildren(browsers);
    process.exit(1);
  }
})();
