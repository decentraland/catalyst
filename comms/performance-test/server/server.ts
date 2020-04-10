import cors from "cors";
import express from "express";
import morgan from "morgan";
import fs from "fs";
import os from "os";
import fetch from "isomorphic-fetch";

const port = parseInt(process.env.PORT ?? "9904");
const localDir = process.env.TEST_RESULTS_LOCATION ?? `${os.homedir()}/peer-performance-tests`;
const STATS_SERVER_URL = process.env.STATS_SERVER_URL ?? "https://stats.eordano.com/";

const app = express();

if (!fs.existsSync(localDir)) {
  fs.mkdirSync(localDir);
}

app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

app.get("/status", (req, res, next) => res.json({ status: "ok" }));

app.listen(port, async () => {
  console.info(`==> Performance test results server listening on port ${port}.`);
});

// TYPES

type TestDataPoint = {
  peerId: string;
  timestamp: number;
  metrics: Record<string, any>;
};

type TopologyDataPoint = {
  timestamp: number;
  topology: any;
};

type TestData = {
  id: string;
  dataPoints: TestDataPoint[];
  started?: number;
  finished?: number;
  topologyDataPoints: TopologyDataPoint[];
  results: Record<string, any>;
};

// DATA

const tests: Record<string, TestData> = {};

function createTest(testId: string, started?: number) {
  tests[testId] = {
    id: testId,
    dataPoints: [],
    started,
    results: {},
    topologyDataPoints: [],
  };

  return tests[testId];
}

function testPath(testId) {
  return `${localDir}/${testId}.json`;
}

async function getTest(testId: string): Promise<TestData> {
  if (tests[testId]) {
    return tests[testId];
  } else {
    try {
      const testJson = await fs.promises.readFile(testPath(testId), "utf-8");
      if (!tests[testId]) {
        //There could be a race condition here, so we check again
        tests[testId] = JSON.parse(testJson);
      }
      return tests[testId];
    } catch (e) {
      console.warn("Couldn't open test " + testId, e);
      throw e;
    }
  }
}

async function exists(testId: string): Promise<boolean> {
  if (tests[testId]) {
    return true;
  } else {
    return await fs.promises
      .access(testPath(testId))
      .then(() => true)
      .catch(() => false);
  }
}

async function persistTestData(test: TestData) {
  const path = testPath(test.id);

  await fs.promises.writeFile(path, JSON.stringify(test), "utf-8");
}

function generateToken(n: number) {
  var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var token = "";
  for (var i = 0; i < n; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

function generateId(timestamp: number) {
  return `${timestamp}-${generateToken(6)}`;
}

// HANDLERS

const validateTestExists = async (req, res, next) => {
  const testExists = await exists(req.params.testId);
  if (testExists) {
    next();
  } else {
    res.status(404).send({ status: "test-not-found" });
  }
};

// This handler assumes the test exists
const validateTestOngoing = async (req, res, next) => {
  const test = await getTest(req.params.testId);
  if (!test.finished && test.started) {
    next();
  } else {
    res.status(400).send({ status: test.started ? "test-already-finished" : "test-not-started" });
  }
};

// ROUTES

function createTestAndRespond(testId: string, req: express.Request, res: express.Response, timestamp: number = Date.now()) {
  const started = req.body?.started;

  const test = createTest(testId, started ? timestamp : undefined);

  res.json({ id: test.id, started: test.started });
}

app.get("/test/:testId", validateTestExists, async (req, res, next) => {
  const { testId } = req.params;
  const includeDataPoints = req.query.dataPoints === "true";

  const test = await getTest(testId);

  res.json(
    includeDataPoints
      ? test
      : {
          id: test.id,
          started: test.started,
          finished: test.finished,
        }
  );
});

app.put("/test/:testId/start", validateTestExists, async (req, res, next) => {
  const { testId } = req.params;

  const test = await getTest(testId);
  test.started = Date.now();

  res.json({ id: test.id, started: test.started });
});

app.put("/test/:testId/topology", validateTestExists, validateTestOngoing, async (req, res, next) => {
  const { testId } = req.params;

  const test = await getTest(testId);
  const topology = req.body;

  test.topologyDataPoints.push({ timestamp: Date.now(), topology });

  res.json({ id: test.id, started: test.started });
});

app.post("/test", (req, res, next) => {
  const timestamp = Date.now();

  const testId = generateId(timestamp);

  createTestAndRespond(testId, req, res, timestamp);
});

app.post("/test/:testId", (req, res, next) => {
  const { testId } = req.params;

  createTestAndRespond(testId, req, res);
});

app.put("/test/:testId/peer/:peerId/metrics", validateTestExists, validateTestOngoing, async (req, res, next) => {
  const { testId, peerId } = req.params;

  const timestamp = Date.now();

  const test = await getTest(testId);

  const dataPoint = {
    peerId,
    timestamp,
    metrics: req.body,
  };

  if (STATS_SERVER_URL) {
    pushDataPointToStatsServer(testId, peerId, req, timestamp);
  }

  test.dataPoints.push(dataPoint);

  res.json(dataPoint);
});

app.put("/test/:testId/peer/:peerId/results", validateTestExists, validateTestOngoing, async (req, res, next) => {
  const { testId, peerId } = req.params;

  const timestamp = Date.now();

  const test = await getTest(testId);

  test.results[peerId] = {
    ...req.body,
    timestamp,
  };

  res.json(test.results[peerId]);
});

app.put("/test/:testId/finish", validateTestExists, validateTestOngoing, async (req, res, next) => {
  const { testId } = req.params;

  const timestamp = Date.now();

  const test = await getTest(testId);

  test.finished = timestamp;

  await persistTestData(test);

  res.json(test);
});
function pushDataPointToStatsServer(testId: string, peerId: string, req, timestamp: number) {
  const header = `test-${testId},peer=${peerId}`;
  const byteLines = ["sent", "received", "relayed", "all", "relevant", "duplicate", "expired"].map(
    (_) =>
      `${header} ${_}Count=${req.body[_]},${_ + "Bytes"}=${req.body[_ + "Bytes"]},${_}Total=${req.body[_ + "Total"]},${_ + "TotalBytes"}=${req.body[_ + "TotalBytes"]},${
        _ + "PerSecond"
      }=${req.body[_ + "PerSecond"]},${_ + "BytesPerSecond"}=${req.body[_ + "BytesPerSecond"]} ${timestamp}`
  );
  const line = `${header} x=${req.body.position[0]},y=${req.body.position[2]},knownPeers=${req.body.knownPeersCount}${
    req.body.averageLatency ? `,latency=${req.body.averageLatency}` : ""
  } ${timestamp}`;

  const url = `${STATS_SERVER_URL}write?db=comms&precision=ms`;
  const body = [...byteLines, line].join("\n");

  fetch(url, {
    method: "POST",
    headers: {
      "content-type": "csv",
    },
    body,
  })
    .then(async (r) => {
      if (r.status >= 400) {
        const text = await r.text();
        console.log("Error: Send stats response status " + r.status);
        if (text) {
          console.log("Response text: " + text);
        }
      }
    })
    .catch((error) => {
      console.log("Error pushing to stats server: ", error);
    });
}
