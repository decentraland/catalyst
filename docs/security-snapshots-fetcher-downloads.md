# Security: hardening peer content downloads (`@dcl/snapshots-fetcher`)

## Status

Open — fix lives upstream in [`@dcl/snapshots-fetcher`](https://github.com/decentraland/snapshots-fetcher).
Pinned version at time of writing: **`@dcl/snapshots-fetcher@9.2.3`**.

This document tracks three related weaknesses in the peer content-download path. They are **not**
fixable inside this repository because the affected code (the raw `http(s).get` downloader) is
internal to the dependency and exposes no timeout/size/redirect options — `downloadEntityAndContentFiles`
takes only `(components, entityId, servers, serverLRU, targetFolder, maxRetries, waitTimeBetweenRetries)`.

## Where it is reached from this repo

`src/logic/batch-deployer/component.ts` → `downloadFullEntity` → `downloadEntityAndContentFiles(...)`,
and the synchronizer wiring in `src/components.ts`. Both ultimately call the dependency's
`downloadFile` (`node_modules/@dcl/snapshots-fetcher/dist/utils.js`, ~lines 129–181).

## Trust model

Catalyst nodes sync deployments from **peer content servers**. The set of peers comes only from the
on-chain DAO catalyst registry or the `CUSTOM_DAO` env var — never from request input or from a peer's
response body. So the attacker for the issues below is **someone who controls a DAO-registered
catalyst** (governance-gated) or who has **compromised an existing cluster member**. Synced content is
otherwise well-defended: every file is hash-verified on download (`assertHash`) and every deployment is
re-validated locally (signature + on-chain access) before being stored or served — a malicious peer
**cannot** poison content or inject unsigned deployments.

## Issues

### 1. SSRF via unrestricted redirect-following (was review finding H2)

`downloadFile` follows `301`/`302` `Location` headers with raw `http(s).get`, with no allow-list, no
private/loopback/link-local IP block, and it permits an `https:`→`http:` downgrade:

```js
if ((response.statusCode === 302 || response.statusCode === 301) && response.headers.location) {
  requestWithRedirects(response.headers.location, redirects + 1) // any host / any protocol
```

A hostile peer can `302`-redirect a content/snapshot fetch to `http://169.254.169.254/...` (cloud
metadata) or an internal service. The downloaded body is hash-checked and discarded on mismatch, so
this is **blind** SSRF (good for internal reachability probing / hitting internal GET endpoints / port
scanning, not for directly exfiltrating the response through this channel).

### 2. No socket timeout (slowloris)

`httpModule.get(url, { headers: { 'accept-encoding': 'gzip' } }, ...)` is called with **no `timeout`**
and no idle-socket timeout. A slow/hostile peer can hold the connection open and dribble bytes.
Partially backstopped today by the download **job** timeout (`timeout: 60000` on the `downloadQueue`,
`src/components.ts`), which abandons the job after 60s — but the socket itself is not bounded per-byte.

### 3. Unbounded gzip decompression (decompression bomb)

The node advertises `accept-encoding: gzip` and inflates the response with `zlib.createGunzip()` with
**no `maxOutputLength`**, streaming straight to disk:

```js
const isGzip = response.headers['content-encoding'] === 'gzip'
const pipe = isGzip ? streamPipeline(response, zlib.createGunzip(), file) : streamPipeline(response, file)
```

A small gzip payload can inflate to many GB and fill the disk **before** the post-write hash check
rejects the (wrong-hash) file. `STORAGE_DECOMPRESS_MAX_FILE_SIZE` only bounds decompression on the
*serving* side (`@dcl/catalyst-storage`); it does not apply to this download path.

## Recommended upstream fix

In `@dcl/snapshots-fetcher`'s `downloadFile`:

1. **Redirects** — before following `response.headers.location`, resolve it and reject targets that are
   not http(s) to a public IP (block RFC1918, loopback, link-local incl. `169.254.169.254`, and ULA),
   and reject `https:`→`http:` downgrades. Prefer constraining redirects to the peer's own origin.
2. **Timeout** — pass `{ timeout: <ms> }` to `http(s).get` and call `request.setTimeout(...)` /
   `request.destroy()` on idle.
3. **Decompression cap** — construct gunzip with a hard ceiling:
   ```js
   zlib.createGunzip({ maxOutputLength: MAX_DECOMPRESSED_BYTES }) // Node ≥ 14 enforces this
   ```
   and/or enforce a running byte cap in the pipeline (e.g. derived from ADR-51
   `entityParameters[type].maxSizeInMB`), aborting past the limit. Also sanity-check `content-length`.

Track the upstream change and bump the pin here once released.

## Interim mitigations (infrastructure)

Until the upstream fix ships, mitigate at the deployment/network layer:

- **Egress firewall**: block outbound traffic from the content server to `169.254.169.254` and to
  RFC1918 / loopback / link-local ranges, allowing only public content-server endpoints.
- **Disk safety**: run on a volume with a quota / separate partition for the temp download folder
  (`tmpDownloadFolder`) and alert on rapid disk growth, so a decompression bomb can't take the host
  down.
- Keep the `downloadQueue` job `timeout` (60s) in place; consider lowering it.
