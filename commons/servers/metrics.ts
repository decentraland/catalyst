import { IMetricsComponent } from '@well-known-components/interfaces'
import { HttpMetrics } from '@well-known-components/metrics/dist/http'
import express from 'express'
import { collectDefaultMetrics, Registry } from 'prom-client'

// Due to security reasons, metrics have their own endpoint and server
export function initializeMetricsServer<T extends string>(
  serverToInstrument: express.Express,
  metricsComponent: IMetricsComponent<T & HttpMetrics> & {
    register: Registry
  }
) {
  const metricsExpressApp = express()

  const port = parseInt(process.env.METRICS_PORT ?? '9090')
  if (isNaN(port)) {
    throw new Error('Invalid non-numeric METRICS_PORT')
  }
  console.log(`Starting the collection of metrics, the metrics are available on :${port}/metrics`)

  const register = metricsComponent.register

  addMetricsEndpointToServer(metricsExpressApp, register)

  if (process.env.COLLECT_DEFAULT_METRICS != 'false') {
    collectDefaultMetrics({ register })
  }

  installMetricsMiddlewares(serverToInstrument, metricsComponent)

  const metricsServer = metricsExpressApp.listen(port)

  // close metrics server when main app closes.
  serverToInstrument.on('close', () => {
    metricsServer.close()
  })

  return { app: metricsExpressApp }
}

function addMetricsEndpointToServer(app: express.Express, registry: Registry) {
  app.get('/metrics', (_req: express.Request, res: express.Response) => {
    registry
      .metrics()
      .then(($) => {
        res.setHeader('content-type', registry.contentType)
        res.send($)
      })
      .catch((err) => {
        console.error(err)
        res.status(500).end()
      })
  })
}

// TODO: once stable, move into well-known-components/metrics/express-helpers
function installMetricsMiddlewares(app: express.Express, metricsComponent: IMetricsComponent<HttpMetrics>) {
  app.use(function metricsMiddleware(req, res, next) {
    const labels = {
      method: req.method,
      handler: '',
      code: 200
    }

    const { end } = metricsComponent.startTimer('http_request_duration_seconds', labels)

    res.on('finish', () => {
      labels.code = (res && res.statusCode) || labels.code

      if (req.route && req.route.path) {
        labels.handler = (req.baseUrl || '') + req.route.path
      }

      const contentLength = res.getHeader('content-length')
      if (typeof contentLength === 'string') {
        metricsComponent.observe('http_request_size_bytes', labels, parseInt(contentLength, 10))
      }
      metricsComponent.increment('http_requests_total', labels)
      end(labels)
    })

    next()
  })
}
