# Get Pointer Changes

List all deployment changes made to pointers.

**URL** : `/pointer-changes`

**Method** : `GET`

**Auth required** : NO

**Permissions required** : NO

**Query Parameters** :

- from

  - Format: int
  - Value: timestamp
  - Example: from=1606829553969
  - Default value: NULL - no lower filter is set
  - Description: Acts as a filter in the collection of deployments, this value is the minimum value of timestamp (of the field indicated by SortingField: localTimestamp is the default) that any deployment in the collection will have.

- to

  - Format: int
  - Value: timestamp
  - Example: to=1606829553969
  - Default value: NULL - no upper filter is set
  - Description: Acts as a filter in the collection of deployments, this value is the maximum value of timestamp (of the field indicated by SortingField: localTimestamp is the default) that any deployment in the collection will have.

- lastId

  - Format: string
  - Value: EntityId
  - Example: lastId=QmNknKv8MuKbfZ73z4QdUEsNbTd1ZAN1fSuwTFGiNGeCt5
  - Default value: -
  - Description: It is the last entity id that was visited, so it will be skipped when showing current page.

- limit

  - Format: int
  - Value: the limit per page number
  - Example: limit=100
  - Default value: 500
  - Description: The deployments are a paginated collection, this parameter corresponds to the limit for each page.

- entityType
  - Format: string array
  - Value: [scene, profile, wearable]
  - Example: entityType=scene&entityType=profile
  - Default value: scene, profile & wearable
  - Description: The type of entities that will be shown in the collection, many values can be sent. If any string ends with an ‘s’ or has whitespaces, then it will be correctly parsed. If any of the entity types sent is invalid, then the request will return a 404 status code.

```json
{
  "deltas": [
    {
      "entityType": "wearable",
      "entityId": "Qme4sizD5eWirC2F5mTagPzYa96h6r12sHMAR9uVznATq5",
      "localTimestamp": 1618412529258,
      "changes": []
    },
    {
      "entityType": "wearable",
      "entityId": "QmQkCHbwGC43KF2VopGGBSBzer2MMDLHti12QVQ8AsDLE7",
      "localTimestamp": 1618412528943,
      "changes": []
    }
  ],
  "filters": {
    "to": 1618412528943
  },
  "pagination": {
    "offset": 0,
    "limit": 2,
    "moreData": true,
    "next": "?to=1618412528943&limit=2&lastId=QmQkCHbwGC43KF2VopGGBSBzer2MMDLHti12QVQ8AsDLE7"
  }
}
```
