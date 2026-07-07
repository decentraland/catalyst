# Content server configuration

The content server can be configured by environment variables.

## Env vars (WIP)

- `DENYLIST_URLS`: List of denylists used by the content server. Separated by new lines `\n`. Default: "https://config.decentraland.org/denylist"
- `DENYLIST_FILE_NAME`: Filename to be used as local denylist. Default: "denylist.txt"
- `SYNC_IGNORED_ENTITY_TYPES`: Ignored entity types, separated by comma. Prevents certain entities from being pulled from DAO catalysts. Default: ""
- `PENDING_DEPLOYMENT_TTL`: How long a partial (multi-request) deployment may stay pending before it is reclaimed, in milliseconds. Anchors the deployment-timestamp TTL check for staged uploads and the expiry job. Default: "86400000" (24h)
- `PENDING_DEPLOYMENTS_CLEANUP_INTERVAL`: How often the job that deletes expired pending deployments runs, in milliseconds. Default: "3600000" (1h)
