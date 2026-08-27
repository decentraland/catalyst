# Content server configuration

The content server can be configured by environment variables.

## Env vars (WIP)

- `DENYLIST_URLS`: List of denylists used by the content server. Separated by new lines `\n`. Default: "https://config.decentraland.org/denylist"
- `DENYLIST_FILE_NAME`: Filename to be used as local denylist. Default: "denylist.txt"
- `SYNC_IGNORED_ENTITY_TYPES`: Ignored entity types, separated by comma. Prevents certain entities from being pulled from DAO catalysts. Default: ""

## Deployment quota (`POST /entities`)

Bounds how much a single client address can deploy of one entity type over four fixed windows. It is
separate from `POST_ENTITIES_RATE_LIMIT_*`, which is a per-client *request* budget over one 60s window
and is blind to entity type, and from `DEPLOYMENT_RATE_LIMIT_*`, which throttles redeployments of the
same *pointer*. Every deploy attempt counts, including one that later fails validation.

Counters are held in memory, so a restart resets them.

- `DEPLOYMENT_QUOTA_MAX_PER_MINUTE`: deployments of one entity type allowed per address per minute. Default: 60
- `DEPLOYMENT_QUOTA_MAX_PER_HOUR`: same, per hour. Default: 600
- `DEPLOYMENT_QUOTA_MAX_PER_DAY`: same, per day. Default: 3000
- `DEPLOYMENT_QUOTA_MAX_PER_WEEK`: same, per week. Default: 10000
- `DEPLOYMENT_QUOTA_MAX_PER_{MINUTE,HOUR,DAY,WEEK}_{ENTITY_TYPE}`: overrides one window for one entity
  type, e.g. `DEPLOYMENT_QUOTA_MAX_PER_HOUR_SCENE=200`. The suffix must be an entity type's exact name
  (`SCENE`, `PROFILE`, `WEARABLE`, `STORE`, `EMOTE`, `OUTFITS`); an unknown one fails startup.
- `DEPLOYMENT_QUOTA_EXEMPT_IPS`: comma-separated addresses and CIDRs that skip the quota, for a backend
  deploying on behalf of many users from one address. Example: `203.0.113.7,198.51.100.0/24,2001:db8::/32`. Default: ""
- `DEPLOYMENT_QUOTA_CACHE_MAX_KEYS`: maximum counters held in memory. An eviction resets one client's
  budget rather than failing a deploy. Default: 100000
- `TRUSTED_CLIENT_IP_HEADER`: header naming the client address, e.g. `cf-connecting-ip`. Shared with
  `POST_ENTITIES_RATE_LIMIT_*`. **Set this whenever the process sits behind a proxy** — otherwise the
  socket address is the proxy's and every client shares one budget. Only set it when the origin cannot
  be reached except through that proxy: the header is forgeable, so a caller with direct access could
  otherwise pick its own bucket or spend a victim's. Default: unset (correct for a directly exposed process)

A window's budget must not be tighter than a shorter window's, or the shorter one's budget could never
be spent; that, a zero, and a malformed address all fail startup rather than run misconfigured.

A rejected deployment answers `429` with `Retry-After`, and says only when to retry — not which budget
or window it hit. Every attempt is reported on
`dcl_content_deployment_quota_attempts_total{entity_type, window, outcome}`, where `outcome` is
`allowed`, `limited` (rejected) or `degraded` (the counter was unreachable, so the attempt was let
through uncounted).
