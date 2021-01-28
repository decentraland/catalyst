# Get history

Please avoid using this endpoint, getting to `/history` is equivalent to getting to `/deployments?sortingField=origin_timestamp&sortingOrder=DESC`

**URL** : `/history`

<!-- **URL Parameters** : `pk=[integer]` where `pk` is the ID of the Account on the server. -->

**Method** : `GET`

**Auth required** : NO

**Permissions required** : NO

**Query Parameters** :

- from
  - Format: int
  - Value: fromOriginTimestamp
  - Example: from=1606829553969
  - Default value: NULL - no lower filter is set
  - Description:Acts as a filter in the collection of deployments, this value is the minimum value of local timestamp that any deployment in the collection will have.

- to
  - Format: int
  - Value: toOriginTimestamp
  - Example: to=1606829553969
  - Default value: NULL - no upper filter is set
  - Description: Acts as a filter in the collection of deployments, this value is the maximum value of local timestamp that any deployment in the collection will have.

- serverName
  - Format: string
  - Value: timestamp
  - Example: serverName="https://peer.decentraland.org/content"
  - Default value: NULL - no filter per server is default configured
  - Description: A filter of the collection per name of the server where the entity was deployed.


## Success Response

**Condition** : -

**Code** : `200 OK`

**Content example**

```json
{
  "events": [
    {
      "entityType": "scene",
      "entityId": "QmVUQ6koiXUMygmKUGp9GwRW5e2qDTjNrwT6JFESCjPkM8",
      "timestamp": 1611864091646,
      "serverName": "https%3A%2F%2Fpeer.decentraland.org%2Fcontent"
    },
    {
      "entityType": "scene",
      "entityId": "QmPGMTUxLwqSkzjapbPwd5fMkVwis3VkepLAWhRpqTVJEj",
      "timestamp": 1611864089589,
      "serverName": "https%3A%2F%2Fpeer.decentraland.org%2Fcontent"
    }
  ],
  "filters": {},
  "pagination": {
    "offset": 0,
    "limit": 500,
    "moreData": true
  }
}
```


## Notes
