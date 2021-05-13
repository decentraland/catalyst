# Get active entity for a content hash

Get the entity ids of the deployments associated with a content hash

**URL** : `/contents/:hashId/active-entities`

**URL Parameters** : `hashId=[integer]` where `hashId` is the ID of the Hash on the server.

**Method** : `GET`

**Auth required** : NO

**Permissions required** : NO

## Success Response

**Condition** : -

**Code** : `200 OK`

**Content example**

```json

[{ "entityId": "QmZbAEFPF7LSq9xVZTCAZoHPNV1QX7YiSbKL2g694EA1r7"}, { "entityId": "QmZbAEFPF7LSq9xVZTCAZoHPNV1QX7YiSbKL2g881MJLj8"}]

```
