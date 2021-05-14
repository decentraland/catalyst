# Get all deployments

List all deployments stored in the content server

**URL** : `/deployments`

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

- entityType
  - Format: string array
  - Value: [scene, profile, wearable]
  - Example: entityType=scene&entityType=profile
  - Default value: scene, profile & wearable
  - Description: The type of entities that will be shown in the collection, many values can be sent. If any string ends with an ‘s’ or has whitespaces, then it will be correctly parsed. If any of the entity types sent is invalid, then the request will return a 404 status code.

- entityId
  - Format: string array
  - Value: ContentFileHash
  - Example: entityId=QmNknKv8MuKbfZ73z4QdUEsNbTd1ZAN1fSuwTFGiNGeCt5
  - Default value:
  - Description: It is the hash value of the entire deployment object.

- onlyCurrentlyPointed
  - Format: boolean
  - Value: true/false
  - Default value:
  - Description: Enable this filter to remove from the view the deployments that have been deleted by a new one.

- deployedBy
  - Format: string array
  - Value: ethAddress
  - Example: deployedBy=0xdbd3b0f6a8a9eb2bb5d968d26e5565a4448919ac
  - Default value:
  - Description: The Address associated with the deployment. This filter is used to obtain deployments from the same user for example.

- sortingField
  - Format: string
  - Value: [local_timestamp, entity_timestamp]
  - Example: sortingField=entity_timestamp
  - Default value: local_timestamp
  - Description: This value is used as the field to order all the deployments in the collection. If no parameter is sent, then the default field to order with will be local_timestamp.

- sortingOrder
  - Format: string
  - Value: [ASC,DESC]
  - Example: sortingOrder=ASC
  - Default value: DESC
  - Description: This value is used as the field to order all the deployments in the collection. If no parameter is sent, then the default order will be desc.

- pointer
  - Format: string array
  - Value: pointers of the entity
  - Example: pointer="106,-33"
  - Default value: -
  - Description: The pointer corresponding to the entity. For example, if the entity type is an scene, then the pointer will be a coordenate. If the entity type is a profile, then the pointer will be an ethAddress.

- limit
  - Format: int
  - Value: the limit per page number
  - Example: limit=100
  - Default value: 500
  - Description: The deployments are a paginated collection, this parameter corresponds to the limit for each page.

- lastId
  - Format: string
  - Value: EntityId
  - Example: lastId=QmNknKv8MuKbfZ73z4QdUEsNbTd1ZAN1fSuwTFGiNGeCt5
  - Default value: -
  - Description: It is the last entity id that was visited, so it will be skipped when showing current page.

- fields
  - Format: string
  - Value: [content, pointers, metadata, auditInfo]
  - Example: fields=content
  - Default value: [content, pointers, metadata]
  - Description: Fields that will be stored in the deployment.



## Success Response

**Condition** : -

**Code** : `200 OK`

**Content example**

```json

{
   "deployments":[
      {
         "entityType":"wearable",
         "entityId":"QmSvFjNVy5n2EcUpMzkTYxUoEVDK5NRqy9dNPZb195NpsY",
         "entityTimestamp":1617981316561,
         "deployedBy":"0x1D9aa2025b67f0F21d1603ce521bda7869098f8a",
         "pointers":[
            "urn:decentraland:mumbai:collections-v2:0xf54ace381e3531b1e4fbaebde1bbd064deb2710c:0"
         ],
         "content":[
            {
               "key":"image.png",
               "hash":"QmcAXXX8z6pT92UVbE7dXv7qRE6PDwo2UznhCB1vjzq3nF"
            },
            {
               "key":"thumbnail.png",
               "hash":"QmPup3Vq7Xp5frNQ2bxG9PkNk7LCQ8BpkKUujobtxo2GXy"
            },
            {
               "key":"vacuum.gltf",
               "hash":"QmbaNfR89xf2rzGmszF3bMb7yMHNDrEztFauFqquwx9Qk8"
            }
         ],
         "metadata":{
            "id":"urn:decentraland:mumbai:collections-v2:0xf54ace381e3531b1e4fbaebde1bbd064deb2710c:0",
            "name":"Vacuum",
            "description":"",
            "collectionAddress":"0xf54ace381e3531b1e4fbaebde1bbd064deb2710c",
            "rarity":"unique",
            "i18n":[
               {
                  "code":"en",
                  "text":"Vacuum"
               }
            ],
            "data":{
               "replaces":[

               ],
               "hides":[

               ],
               "tags":[

               ],
               "representations":[
                  {
                     "bodyShapes":[
                        "urn:decentraland:off-chain:base-avatars:BaseMale"
                     ],
                     "mainFile":"vacuum.gltf",
                     "contents":[
                        {
                           "key":"vacuum.gltf",
                           "url":"https://peer.decentraland.zone/content/contents/QmbaNfR89xf2rzGmszF3bMb7yMHNDrEztFauFqquwx9Qk8"
                        },
                        {
                           "key":"thumbnail.png",
                           "url":"https://peer.decentraland.zone/content/contents/QmPup3Vq7Xp5frNQ2bxG9PkNk7LCQ8BpkKUujobtxo2GXy"
                        }
                     ],
                     "overrideHides":[

                     ],
                     "overrideReplaces":[

                     ]
                  },
                  {
                     "bodyShapes":[
                        "urn:decentraland:off-chain:base-avatars:BaseFemale"
                     ],
                     "mainFile":"vacuum.gltf",
                     "contents":[
                        {
                           "key":"vacuum.gltf",
                           "url":"https://peer.decentraland.zone/content/contents/QmbaNfR89xf2rzGmszF3bMb7yMHNDrEztFauFqquwx9Qk8"
                        },
                        {
                           "key":"thumbnail.png",
                           "url":"https://peer.decentraland.zone/content/contents/QmPup3Vq7Xp5frNQ2bxG9PkNk7LCQ8BpkKUujobtxo2GXy"
                        }
                     ],
                     "overrideHides":[

                     ],
                     "overrideReplaces":[

                     ]
                  }
               ],
               "category":"earring"
            },
            "image":"image.png",
            "thumbnail":"thumbnail.png",
            "metrics":{
               "triangles":1406,
               "materials":5,
               "textures":0,
               "meshes":5,
               "bodies":5,
               "entities":1
            },
            "createdAt":1617981316555,
            "updatedAt":1617981316555
         },
         "local_timestamp":1618412500309
      },
      {
         "entityType":"wearable",
         "entityId":"QmZbAEFPF7LSq9xVZTCAZoHPNV1QX7YiSbKL2g694EA1r7",
         "entityTimestamp":1617990950797,
         "deployedBy":"0x1D9aa2025b67f0F21d1603ce521bda7869098f8a",
         "pointers":[
            "urn:decentraland:mumbai:collections-v2:0x49cb9fcf3f6b8e1255ba6619ce61ed27f4fd75e3:0"
         ],
         "content":[
            {
               "key":"image.png",
               "hash":"QmTXkqHja4niq59BNhRDmhVhExo8RmNmxAHihbtso1bSvX"
            },
            {
               "key":"Scoreboard.gltf",
               "hash":"QmbXdxDwpvQqEPpVCgiTW2nuD6PKqYLcTRtTigBwVCsPVg"
            },
            {
               "key":"thumbnail.png",
               "hash":"QmfWaE63Hu59ZtVdfM1UVvcSLpS9NgTBD6cQLojATpGkcx"
            }
         ],
         "metadata":{
            "id":"urn:decentraland:MUMBAI:collections-v2:0x49cb9fcf3f6b8e1255ba6619ce61ed27f4fd75e3:0",
            "name":"Scoreboard gltf",
            "description":"",
            "collectionAddress":"0x49cb9fcf3f6b8e1255ba6619ce61ed27f4fd75e3",
            "rarity":"unique",
            "i18n":[
               {
                  "code":"en",
                  "text":"Scoreboard gltf"
               }
            ],
            "data":{
               "replaces":[

               ],
               "hides":[

               ],
               "tags":[

               ],
               "representations":[
                  {
                     "bodyShapes":[
                        "urn:decentraland:off-chain:base-avatars:BaseMale"
                     ],
                     "mainFile":"vacuum.gltf",
                     "contents":[
                        {
                           "key":"vacuum.gltf",
                           "url":"https://peer.decentraland.zone/content/contents/QmbaNfR89xf2rzGmszF3bMb7yMHNDrEztFauFqquwx9Qk8"
                        },
                        {
                           "key":"thumbnail.png",
                           "url":"https://peer.decentraland.zone/content/contents/QmPup3Vq7Xp5frNQ2bxG9PkNk7LCQ8BpkKUujobtxo2GXy"
                        }
                     ],
                     "overrideHides":[

                     ],
                     "overrideReplaces":[

                     ]
                  },
                  {
                     "bodyShapes":[
                        "urn:decentraland:off-chain:base-avatars:BaseFemale"
                     ],
                     "mainFile":"vacuum.gltf",
                     "contents":[
                        {
                           "key":"vacuum.gltf",
                           "url":"https://peer.decentraland.zone/content/contents/QmbaNfR89xf2rzGmszF3bMb7yMHNDrEztFauFqquwx9Qk8"
                        },
                        {
                           "key":"thumbnail.png",
                           "url":"https://peer.decentraland.zone/content/contents/QmPup3Vq7Xp5frNQ2bxG9PkNk7LCQ8BpkKUujobtxo2GXy"
                        }
                     ],
                     "overrideHides":[

                     ],
                     "overrideReplaces":[

                     ]
                  }
               ],
               "category":"earring"
            },
            "image":"image.png",
            "thumbnail":"thumbnail.png",
            "metrics":{
               "triangles":314,
               "materials":17,
               "textures":1,
               "meshes":15,
               "bodies":17,
               "entities":1
            },
            "createdAt":1617990950757,
            "updatedAt":1617990950757
         },
         "local_timestamp":1618412499760
      }
   ],
   "filters":{
      "to":1618412485287
   },
   "pagination":{
      "offset":0,
      "limit":2,
      "moreData":true,
      "lastId":"qmr15dprqcq17nzywfq88sqly2qqh6b9lpv1g1xnpcsdya",
      "next":"?to=1618412499760&sortingField=local_timestamp&sortingOrder=DESC&lastId=QmZbAEFPF7LSq9xVZTCAZoHPNV1QX7YiSbKL2g694EA1r7&limit=2"
   }
}

```
