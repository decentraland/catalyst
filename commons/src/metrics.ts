import express from 'express';
import ResponseTime from 'response-time';
import { register as Register, Counter, Summary, collectDefaultMetrics } from 'prom-client';

const pathsTaken = new Counter({
    name: 'paths_taken',
    help: 'Paths taken in the app',
    labelNames: ['path']
});

const responses = new Summary({
    name: 'http_responses',
    help: 'Response time in milliseconds',
    labelNames: ['method', 'path', 'status']
});

const numRequests = new Counter({
    name: 'num_requests',
    help: 'Number of requests made',
    labelNames: ['method']
});

const port = parseInt(process.env.METRICS_PORT ?? "9090");

export class Metrics {
    static initialize(app: express.Express) {
        const metricsServer = express();
        app.use(Metrics.requestCounters);
        app.use(Metrics.responseCounters);
        this.injectMetricsRoute(metricsServer);
        this.startCollection(metricsServer);
    }

    static requestCounters = function (req, res, next) {
        numRequests.inc({ method: req.method });
        pathsTaken.inc({ path: req.path });
        next();
    }

    static responseCounters = ResponseTime(function (req, res, time) {
        responses.labels(req.method, req.url, res.statusCode).observe(time);
    })

    static injectMetricsRoute(app: express.Express) {
        app.get('/metrics', (req, res) => {
            res.set('Content-Type', Register.contentType);
            res.end(Register.metrics());
        });
    };

    static startCollection(app: express.Express) {
        console.log(`Starting the collection of metrics, the metrics are available on :${port}/metrics`);
        collectDefaultMetrics();
        app.listen(port);
    };
}