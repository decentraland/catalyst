# Content server configuration

The content server can be configured by environment variables.

## Env vars (WIP)

- `DENYLIST_URLS`: List of denylists used by the content server. Separated by new lines `\n`. Default: "https://config.decentraland.org/denylist"
- `DENYLIST_FILE_NAME`: Filename to be used as local denylist. Default: "denylist.txt"
- `SYNC_IGNORED_ENTITY_TYPES`: Ignored entity types, separated by comma. Prevents certain entities from being pulled from DAO catalysts. Default: ""
- `PENDING_DEPLOYMENT_TTL`: Fixed lifetime of a partial (multi-request) deployment, in milliseconds, counted from its first request. Retries do not extend it. Default: "86400000" (24h)
- `MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER`: Max pending uploads per deployer, including expired uploads awaiting cleanup. Default: "10"
- `MAX_PENDING_BYTES_PER_DEPLOYER`: Max staged/reserved bytes per deployer. Expired uploads stay charged until their content is deleted. Default: "1073741824" (1 GiB)
- `MAX_PENDING_BYTES`: Max staged/reserved bytes across the server. Default: "53687091200" (50 GiB)
- `MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE`: Accepted partial batch bytes per deployer per fixed one-minute window, retries included. Default: "536870912" (512 MiB)
- `CONTENT_LOCK_CONNECTIONS`: Connections of the dedicated pool holding the advisory lock shared by deployments and excluded by garbage collection, in addition to `PG_POOL_SIZE`. Default: "16"
- `MAX_IN_FLIGHT_UPLOAD_BYTES`: Max POST /entities body bytes buffered in memory at once across all clients; excess uploads get a `503`. Partial batches are exempt from the per-IP request limits and bounded by this instead. Must be at least `MAX_UPLOAD_TOTAL_SIZE`. Default: "4294967296" (4 GiB)
- `MAX_CONCURRENT_UPLOADS`: Max POST /entities bodies buffered at once across all clients; excess uploads get a `503`. Default: "40"
- `MULTIPART_UPLOAD_TIMEOUT_MS`: Max time to receive a POST /entities body; a slower upload is aborted with a `408` and its upload slot released. Default: "300000" (5 min)
- `PENDING_DEPLOYMENTS_CLEANUP_INTERVAL`: How often the job that reclaims expired pending deployments (their unreferenced staged content, then their accounting) runs, in milliseconds. Default: "3600000" (1h)
