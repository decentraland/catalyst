import { spawn, ChildProcess } from "child_process";
import puppeteer, { Browser } from "puppeteer";
import treekill from "tree-kill";

require("isomorphic-fetch");

function bazelExec(command: string, label: string, env: object = {}) {
  const child = spawn(`yarn`, ["bazel", "run", command], {
    cwd: process.env.BUILD_WORKSPACE_DIRECTORY,
    env: { PATH: process.env.PATH, ...env }
  });

  child.stdout?.on("data", data => console.log(`\n[${label}]\n`, data.toString(), `[/${label}]\n`));

  return child;
}

const devServer = bazelExec("//comms/performance-test/client:devserver", "DEVSERVER");
const resultsServer = bazelExec("//comms/performance-test/server", "RESULTS_SERVER");
const lighthouse = bazelExec("//comms/lighthouse:server", "LIGHTHOUSE", { NO_AUTH: "true" });

function awaitOutput(process: ChildProcess, output: string) {
  return new Promise((resolve, reject) => {
    process.stdout?.on("data", data => {
      if (data.toString().includes(output)) {
        resolve();
      }
    });
  });
}

const browserCount = process.env.BROWSERS_COUNT ?? 10;

(async () => {
  await Promise.all([awaitOutput(devServer, "Server listening on"), awaitOutput(lighthouse, "Lighthouse listening on"), awaitOutput(resultsServer, "server listening on")]);

  console.log("Child process are listening");

  const testResponse = await fetch("http://localhost:9904/test", { method: "POST", body: JSON.stringify({ started: true }), headers: { "Content-Type": "application/json" } });
  const testJson = await testResponse.json();

  const testId = testJson.id;

  console.log("Running test with id: " + testId);

  const promises: Promise<void>[] = [];
  const browsers: Browser[] = [];

  for (let i = 0; i < browserCount; i++) {
    promises.push(
      new Promise(async (resolve, reject) => {
        try {
          const browser = await puppeteer.launch();
          browsers.push(browser);
          const page = await browser.newPage();
          await page.goto(`http://localhost:7654?sessionId=${i}&numberOfPeers=1&testId=${testId}`);

          page.on("console", async msg => {
            if (msg.type() === "error") {
              console.log(`\n[BROWSER-${i}]`, ...msg.args(), `[/BROWSER-${i}]\n`);
            } else {
              console.log(`\n[BROWSER-${i}]`, msg.text(), `[/BROWSER-${i}]\n`);
            }
          });

          page.on("console", msg => {
            if (msg.text() === "Test finished") {
              resolve();
            }

            if (msg.type() === "error") {
              reject(msg.args);
            }
          });
        } catch (e) {
          console.error("Error running browser " + i, e);
          reject(e);
        }
      })
    );
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

  const killAllChildren = async () => {
    console.log("Test finished. Killing all processes");
    await Promise.all(browsers.map(it => it.close()));
    await killProcesses(devServer.pid, lighthouse.pid, resultsServer.pid);
  };

  try {
    await Promise.all(promises);

    await fetch(`http://localhost:9904/test/${testId}/finish`, { method: "PUT" });
    console.log(`Test ${testId} finished`);

    await killAllChildren();
    process.exit(0);
  } catch (e) {
    await killAllChildren();
    process.exit(1);
  }
})();
