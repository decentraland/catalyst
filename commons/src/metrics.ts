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

export class Metrics {
    static initialize(app) {
        app.use(Metrics.requestCounters);
        app.use(Metrics.responseCounters);
        this.injectMetricsRoute(app);
        this.startCollection();
    }

    static requestCounters = function (req, res, next) {
        if (req.path != '/metrics') {
            numRequests.inc({ method: req.method });
            pathsTaken.inc({ path: req.path });
        }
        next();
    }

    static responseCounters = ResponseTime(function (req, res, time) {
        if (req.url != '/metrics') {
            responses.labels(req.method, req.url, res.statusCode).observe(time);
        }
    })

    static injectMetricsRoute(app) {
        app.get('/metrics', (req, res) => {
            res.set('Content-Type', Register.contentType);
            res.end(Register.metrics());
        });
    };

    static startCollection() {
        console.log('Starting the collection of metrics, the metrics are available on /metrics');
        collectDefaultMetrics();
    };
}