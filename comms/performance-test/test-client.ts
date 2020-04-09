import puppeteer, { Browser } from "puppeteer";

export async function runClients(
  count: number,
  testId: string,
  lighthouseUrl: string = "http://localhost:9000",
  statsServerUrl: string = "http://localhost:9904",
  clientUrl: string = "http://localhost:7654",
  testDuration: number = 180
) {
  const promises: Promise<Browser>[] = [];

  for (let i = 0; i < count; i++) {
    promises.push(
      new Promise(async (resolve, reject) => {
        try {
          const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
          const page = await browser.newPage();
          const url = `${clientUrl}?sessionId=${i}&numberOfPeers=1&testId=${testId}&lighthouseUrl=${lighthouseUrl}&statsServerUrl=${statsServerUrl}&testDuration=${testDuration}`;
          console.log("Opening client with url: " + url);
          await page.goto(url);

          page.on("console", msg => {
            if (msg.type() === "error") {
              console.log(`\n[BROWSER-${i}]`, msg, `[/BROWSER-${i}]\n`);
            } else {
              console.log(`\n[BROWSER-${i}]`, msg.text(), `[/BROWSER-${i}]\n`);
            }
          });

          page.on("console", msg => {
            if (msg.text() === "Test finished") {
              resolve(browser);
            }

            if (msg.text() === "Test aborted") {
              reject(msg);
            }
          });
        } catch (e) {
          console.error("Error running browser " + i, e);
          reject(e);
        }
      })
    );
  }

  return Promise.all(promises);
}
