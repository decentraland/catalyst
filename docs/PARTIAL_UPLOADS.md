# Partial (multi-request) scene uploads

A scene too large for one request can be uploaded to `POST /entities` in several batches (ADR-325). Only scenes with IPFS v2 entity ids are supported.

## Protocol

Every batch is a regular `POST /entities` multipart form (`entityId`, `authChain`, files keyed by their content hash) plus:

- the form field `partial=true`, which makes the request a batch;
- the query parameter `?partial=true` (recommended), which declares the batch before its body is read, so the per-IP daily quota of regular deployments doesn't turn it away. The query parameter without the form field gets a `400`.

The first batch must carry the entity file. Later batches may omit it if they are signed by the account that started the upload. Each file must hash to its field name.

| Response                       | Meaning                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `202 {"missing": [hash, ...]}` | Batch stored. Send the listed hashes next.                                    |
| `200 {"creationTimestamp": n}` | The batch completed the upload: the entity was fully validated and published. |
| `200 {"creationTimestamp": n}` | Any batch for an entity that is already published (a replay).                 |

Content already on the server is never listed as missing. Publication runs the same validation as a regular deployment; if content went missing meanwhile, the batch answers `202` with it.

## Errors and `Retry-After`

| Status | When                                                                                                                                                                                                                                                     | Retry                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `400`  | The request can never succeed: bad signature, hash mismatch, invalid or non-scene entity, missing entity file, an upload started by another account, an expired upload, a scene over its size limit, an upload or batch larger than a budget on its own. | Don't retry. An expired upload needs a new entity with a fresh timestamp. |
| `408`  | The body didn't arrive within `MULTIPART_UPLOAD_TIMEOUT_MS`.                                                                                                                                                                                             | Retry the batch.                                                          |
| `413`  | A multipart limit (`MAX_UPLOAD_FILE_SIZE`, `MAX_UPLOAD_FILE_COUNT`, `MAX_UPLOAD_TOTAL_SIZE`, field count or size).                                                                                                                                       | Split into smaller batches.                                               |
| `429`  | A quota that frees with time (below).                                                                                                                                                                                                                    | After `Retry-After` seconds.                                              |
| `503`  | A transient server condition: the content lock stayed busy (garbage collection or cleanup), the in-memory upload budget is full, or the node is bootstrapping.                                                                                           | After `Retry-After` seconds.                                              |

`429` quotas, with the `reason` label of `dcl_partial_upload_throttled_total`:

| Reason                | Limit                                                | `Retry-After`                                                  |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| `uploads_per_account` | `MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER`               | The first cleanup run after the oldest charged upload expires. |
| `bytes_per_account`   | `MAX_PENDING_BYTES_PER_DEPLOYER`                     | Same.                                                          |
| `bytes_per_server`    | `MAX_PENDING_BYTES`                                  | Same, over every account's uploads.                            |
| `bytes_per_minute`    | `MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE`                | Time left in the account's one-minute window.                  |
| `entity_rate_limit`   | Per-pointer deployment rate limit                    | Time until the pointers' limit clears.                         |
| `pointer_conflict`    | Another deployment of the same pointers is in flight | 5 s.                                                           |

The per-source limits (`MAX_CONCURRENT_UPLOADS_PER_SOURCE`, `MAX_IN_FLIGHT_UPLOAD_BYTES_PER_SOURCE`) and the per-minute burst limit (`POST_ENTITIES_RATE_LIMIT_MAX`) also answer `429` with `Retry-After`, before the body is read.

## Lifetime and cleanup

An upload lives `PENDING_DEPLOYMENT_TTL` (1 h) from the arrival of its first batch; batches don't extend it. A batch still being processed when it ends is rejected before storing or publishing. Expired uploads stay charged against the quotas until the cleanup job, every `PENDING_DEPLOYMENTS_CLEANUP_INTERVAL` (5 min), deletes their unreferenced content and releases their accounting.

## Limits

Clients should send batches of at most 100 MiB (infrastructure cuts requests above ~200 MB); the SDK uses 32 MiB. A scene's content is capped per parcel, as for regular deployments. The entity file is capped at 10 MiB. See [CONFIGURATION.md](CONFIGURATION.md) for every variable named above and its default.

## Metrics

- `dcl_partial_deployments_staging_total{kind}`: batches by outcome (`accepted`, `finalized`, `replayed`, `validation_error`, `throttled`, `busy`, `error`).
- `dcl_partial_uploads_started_total`, `dcl_partial_uploads_completed_total`: uploads started and published; the latter is the authoritative publication count.
- `dcl_partial_upload_throttled_total{reason}`: `429`s by quota.
- `dcl_partial_upload_stage_duration_seconds{stage}`: time per stage (`hash`, `validate`, `lock_wait`, `inventory`, `accounting`, `store`, `progress`, `finalize_verify`, `finalize_deploy`).
