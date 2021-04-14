# Content Server API

## Endpoints

* Audit: `GET /audit/:type/:entityId`
* Challenge: `GET /challenge`
* Contents per hashId: `GET /contents/:hashId`
* Available Content: `GET /available-content`
* Denylist: `GET /denylist`
* Put Denylist: `PUT /denylist/:type/:id`
* Delete Denylist: `DELETE /denylist/:type/:id`
* Head Denylist: `HEAD /denylist/:type/:id`
* [Deployments](deployments/get.md) : `GET /deployments`
* Post Entities: `POST /entities`
* Get Entities: `GET /entities/:type`
* Failed Deployments: `GET /failedDeployments`
* [History](history/get.md) : `GET /history`
* [Pointer Changes](pointerChanges/get.md) : `GET /pointerChanges'`
* Snapshot: `GET /snapshot/:type`
* Status: `GET /status`


<!-- Documentation template obtained from https://github.com/jamescooke/restapidocs -->
