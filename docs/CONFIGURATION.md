# Content server configuration

The content server can be configured by environment variables.

## Env vars (WIP)

- `DENYLIST_URLS`: List of denylists used by the content server. Separated by new lines `\n`. Default: "https://config.decentraland.org/denylist"
- `DENYLIST_FILE_NAME`: Filename to be used as local denylist. Default: "denylist.txt"
- `SYNC_IGNORED_ENTITY_TYPES`: Ignored entity types, separated by comma. Prevents certain entities from being pulled from DAO catalysts. Default: ""
