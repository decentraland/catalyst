import { exec, ChildProcess } from "child_process";
import puppeteer from "puppeteer";

// console.log("env:\n", process.env);

function bazelExec(command: string, label: string) {
  const child = exec(
    `yarn bazel run ${command}`,
    {
      cwd: process.env.BUILD_WORKSPACE_DIRECTORY,
      env: { PATH: process.env.PATH }
    },
    (error, stdout, stderr) => {
      console.log("error:\n", error);
      console.log("\nstdout:\n", stdout);
      console.log("\nstderr:\n", stderr);
    }
  );

  child.stdout?.on("data", data =>
    console.log(`\n[${label}]\n`, data, `[/${label}]\n`)
  );

  return child;
}

const devServer = bazelExec(
  "//comms/peer/scripts/stress-test:devserver",
  "DEVSERVER"
);
const lighthouse = bazelExec("//comms/lighthouse:server", "LIGHTHOUSE");

function awaitOutput(process: ChildProcess, output: string) {
  return new Promise((resolve, reject) => {
    process.stdout?.on("data", data => {
      if (data.toString().includes(output)) {
        resolve();
      }
    });
  });
}

const browserCount = 5;

(async () => {
  await Promise.all([
    awaitOutput(devServer, "Server listening on"),
    awaitOutput(lighthouse, "Lighthouse listening on")
  ]);

  console.log("Child process are listening");

  for (let i = 0; i < browserCount; i++) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto("http://localhost:7654");

    page.on("console", msg => console.log(`\n[PEER-${i}]`, msg.text(), `[/PEER-${i}]\n`));
  }
})();
