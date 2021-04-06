import express, { RequestHandler } from 'express'
import { collectDefaultMetrics, Counter, register as Register, Summary } from 'prom-client'
import ResponseTime from 'response-time'

const pathsTaken = new Counter({
  name: 'paths_taken',
  help: 'Paths taken in the app',
  labelNames: ['path']
})

const responses = new Summary({
  name: 'http_responses',
  help: 'Response time in milliseconds',
  labelNames: ['method', 'path', 'status']
})

const numRequests = new Counter({
  name: 'num_requests',
  help: 'Number of requests made',
  labelNames: ['method']
})

const port = parseInt(process.env.METRICS_PORT ?? '9090')
let requestMetricsHandlers: RequestHandler[] = []

export class Metrics {
  static initialize() {
    const metricsServer = express()
    this.injectMetricsRoute(metricsServer)
    this.startCollection(metricsServer)
    requestMetricsHandlers = [this.requestCounters, this.responseCounters]
  }

  static requestHandlers(): RequestHandler[] {
    return requestMetricsHandlers
  }

  private static requestCounters = function (req, _res, next) {
    numRequests.inc({ method: req.method })
    pathsTaken.inc({ path: req.baseUrl + req.route.path })
    next()
  }

  private static responseCounters = ResponseTime(function (req, res, time) {
    responses.labels(req.method, req.baseUrl + req.route.path, res.statusCode).observe(time)
  })

  private static injectMetricsRoute(app: express.Express) {
    app.get('/metrics', async (req, res) => {
      res.set('Content-Type', Register.contentType)
      res.end(await Register.metrics())
    })
  }

  private static startCollection(app: express.Express) {
    console.log(`Starting the collection of metrics, the metrics are available on :${port}/metrics`)
    collectDefaultMetrics()
    app.listen(port)
  }
}
