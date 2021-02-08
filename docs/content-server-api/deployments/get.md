# Get all deployments

List all deployments stored in the content server

**URL** : `/deployments`

<!-- **URL Parameters** : `pk=[integer]` where `pk` is the ID of the Account on the server. -->

**Method** : `GET`

**Auth required** : NO

**Permissions required** : NO

**Query Parameters** :

- fromLocalTimestamp
  - Format: int
  - Value: timestamp
  - Example: fromLocalTimestamp=1606829553969
  - Default value: NULL - no lower filter is set
  - Description: Acts as a filter in the collection of deployments, this value is the minimum value of local timestamp that any deployment in the collection will have.

- toLocalTimestamp
  - Format: int
  - Value: timestamp
  - Example: toLocalTimestamp=1606829553969
  - Default value: NULL - no upper filter is set
  - Description: Acts as a filter in the collection of deployments, this value is the maximum value of local timestamp that any deployment in the collection will have.

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

- offset
  - Format: int
  - Value: the offset number
  - Example: offset=1
  - Default value: 0
  - Description: The deployments are a paginated collection, this parameter corresponds to the offset of those pages.

- limit
  - Format: int
  - Value: the limit per page number
  - Example: limit=100
  - Default value: 500
  - Description: The deployments are a paginated collection, this parameter corresponds to the limit for each page.

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
  "deployments": [
    {
      "entityType": "profile",
      "entityId": "QmXRXz19n9AJdbaSGd9riaZNmpX3yujVxTLhcToqycBy6s",
      "entityTimestamp": 1611804028466,
      "deployedBy": "0xF3aC247cA55ACc36a0b532b193EF60F463d78cA4",
      "pointers": [
        "0xf3ac247ca55acc36a0b532b193ef60f463d78ca4"
      ],
      "content": [
        {
          "key": "./body.png",
          "hash": "QmUy6BPixnNVfXZH8r83asXUrzGimqqUhtL1geYbbpo8zE"
        },
        {
          "key": "./face128.png",
          "hash": "QmaxLeiGu6XFKAjwdStKs4MKaJKp855ZJfQ8i4JFK8YaLg"
        },
        {
          "key": "./face256.png",
          "hash": "QmVtJ7Jwuz8iWi1GjSanbiZ8fJqCievYJadbL7P48e1WVL"
        },
        {
          "key": "./face.png",
          "hash": "Qmc1Tbmaow1gRu3T6XYFNKi2YtH5TuVv1h3Q4m9vD5xizs"
        }
      ],
      "metadata": {
        "avatars": [
          {
            "userId": "0xf3ac247ca55acc36a0b532b193ef60f463d78ca4",
            "email": "",
            "name": "Emmant#8ca4",
            "hasClaimedName": false,
            "description": "",
            "ethAddress": "0xF3aC247cA55ACc36a0b532b193EF60F463d78cA4",
            "version": 3,
            "avatar": {
              "bodyShape": "dcl://base-avatars/BaseMale",
              "snapshots": {
                "face": "Qmc1Tbmaow1gRu3T6XYFNKi2YtH5TuVv1h3Q4m9vD5xizs",
                "face128": "QmaxLeiGu6XFKAjwdStKs4MKaJKp855ZJfQ8i4JFK8YaLg",
                "face256": "QmVtJ7Jwuz8iWi1GjSanbiZ8fJqCievYJadbL7P48e1WVL",
                "body": "QmUy6BPixnNVfXZH8r83asXUrzGimqqUhtL1geYbbpo8zE"
              },
              "eyes": {
                "color": {
                  "color": {
                    "r": 0.37109375,
                    "g": 0.22265625,
                    "b": 0.1953125,
                    "a": 1
                  }
                }
              },
              "hair": {
                "color": {
                  "color": {
                    "r": 0.109375,
                    "g": 0.109375,
                    "b": 0.109375,
                    "a": 1
                  }
                }
              },
              "skin": {
                "color": {
                  "color": {
                    "r": 0.94921875,
                    "g": 0.76171875,
                    "b": 0.6484375,
                    "a": 1
                  }
                }
              },
              "wearables": [
                "dcl://base-avatars/cool_hair",
                "dcl://base-avatars/eyebrows_05",
                "dcl://base-avatars/eyes_03",
                "dcl://base-avatars/mouth_06",
                "dcl://base-avatars/soccer_shirt",
                "dcl://base-avatars/moccasin",
                "dcl://base-avatars/thug_life",
                "dcl://base-avatars/oxford_pants"
              ]
            },
            "inventory": [],
            "muted": [
              "0x5901feb8bc4b2b17dd588db68afcb9512bbb46b8"
            ],
            "tutorialStep": 384,
            "interests": [],
            "unclaimedName": "Emmant"
          }
        ]
      }
    },
    {
      "entityType": "scene",
      "entityId": "QmW5MbgGfjFfe2bmgyfaQxcyLvM728WT4Td8xdFUfoy6Bb",
      "entityTimestamp": 1611861332358,
      "deployedBy": "0x5E382071464A6F9EA29708A045983dc265B0D86d",
      "pointers": [
        "110,-29"
      ],
      "content": [
        {
          "key": "bin/game.js",
          "hash": "QmSZXSxHvXusLX24vdkDtTDuy2vcS7UECAuVTQUUSFjphW"
        },
        {
          "key": "models/Bicycle_02/Bicycle_02.glb",
          "hash": "QmVQgqiao9g62WGBEDWNUkh2LSowL16wqNvEuaHGLMgW1K"
        },
        {
          "key": "models/Bicycle_02/file1.png",
          "hash": "QmPLdeHkHbT1SEdouMJLFRAubYr4jiQEut9HhKyuQ8oK8V"
        },
        {
          "key": "models/Bicycle_02/thumbnail.png",
          "hash": "QmS9oYhNG82jQWAtcBiV9CvbTYbKKgQELRhF3tdwZkz794"
        },
        {
          "key": "models/Bush_Fantasy_01/Bush_Fantasy_01.glb",
          "hash": "QmUGAWn7r16N4CHDUcSXPcKB7HEEigokX11QJ9GWAq8AeA"
        },
        {
          "key": "models/Bush_Fantasy_01/FanstasyPack_TX.png",
          "hash": "QmcFNQY9xLbqRNMpacFtB1zt6hYg35cMoRFytv46iPNpGA"
        },
        {
          "key": "models/Bush_Fantasy_01/thumbnail.png",
          "hash": "QmWc9wonrsPYue3zu5cP9dDJo4RetqTgqrZ6QMNadLUP5F"
        },
        {
          "key": "models/Cactus_01/Cactus_01.glb",
          "hash": "QmXSEL1u47yRokhwrZ6v5QPMM53si99Cy3WdhFi14mGyyf"
        },
        {
          "key": "models/Cactus_01/file1.png",
          "hash": "QmPLdeHkHbT1SEdouMJLFRAubYr4jiQEut9HhKyuQ8oK8V"
        },
        {
          "key": "models/Cactus_01/thumbnail.png",
          "hash": "QmQJiPhXDZLYzqPNJ9gLDTNnrJDB8HwPSF9EryJHLMADhH"
        },
        {
          "key": "models/FloorBaseSand_01/FloorBaseSand_01.glb",
          "hash": "QmRw7WQm6697vwMk2AncWUHY623FWJrXm6cwS9RmgoJhrm"
        },
        {
          "key": "models/FloorBaseSand_01/Floor_Sand01.png.png",
          "hash": "QmZrSxigUfptQCVohiBWRqG2S19q7WmSP1tKi7ZTn6pXwr"
        },
        {
          "key": "models/FloorBaseSand_01/thumbnail.png",
          "hash": "QmRCqyMgHzDbhocmsNLmFjyyWNP4F8SgVnYbdqc2S9Zt2K"
        },
        {
          "key": "models/Fountain_01/file1.png",
          "hash": "QmPLdeHkHbT1SEdouMJLFRAubYr4jiQEut9HhKyuQ8oK8V"
        },
        {
          "key": "models/Fountain_01/Fountain_01.glb",
          "hash": "QmV9wHEbhkcjbBkxgzVFFSvPnNMfcj76hUFSM6aBPUjpYg"
        },
        {
          "key": "models/Fountain_01/thumbnail.png",
          "hash": "Qmc8psY8TdDqzWqyurHotTtCwNJBz9UjATBGgXxDDkpXcm"
        },
        {
          "key": "models/Tree_Forest_Pink_02/FanstasyPack_TX.png",
          "hash": "QmcFNQY9xLbqRNMpacFtB1zt6hYg35cMoRFytv46iPNpGA"
        },
        {
          "key": "models/Tree_Forest_Pink_02/thumbnail.png",
          "hash": "QmSjSMBYaKveHH98ffRLBXza6EFGaaueMvYXVbXip3tugL"
        },
        {
          "key": "models/Tree_Forest_Pink_02/Tree_Forest_Pink_02.glb",
          "hash": "QmfYZzC8nEzoM5An3B4hVsAgvfxiddU4ESALKXk8caPbdD"
        },
        {
          "key": "models/Wall_Stone_Medium/FanstasyPack_TX.png",
          "hash": "QmcFNQY9xLbqRNMpacFtB1zt6hYg35cMoRFytv46iPNpGA"
        },
        {
          "key": "models/Wall_Stone_Medium/thumbnail.png",
          "hash": "QmeaKgqeh2tkqTvMkTFjj6CGBMPYAw9xpjc65X5DJbTtFJ"
        },
        {
          "key": "models/Wall_Stone_Medium/Wall_Stone_Medium.glb",
          "hash": "QmUVb5oRkHpSX7mnCy6vxxarsZc3SsvRof2QKJyfNQEgUT"
        },
        {
          "key": "package.json",
          "hash": "QmRXWsaHghHsREjcZg76JSfNarqXfP2V8BS1ddrDpQzA2f"
        },
        {
          "key": "scene.json",
          "hash": "QmbALgt4UDYdHroRcR9ukP8c9ehd8vQERuhuvgoWxiCtwt"
        },
        {
          "key": "scene-thumbnail.png",
          "hash": "QmNiTUMDxjLVpb91krH31o4DJyUNBtSLDK4xrdFSEwqkb4"
        },
        {
          "key": "tsconfig.json",
          "hash": "QmbgY2L84pv7aJRhf83i6SsTGy597jGoHtazL23HoERjhU"
        }
      ],
      "metadata": {
        "display": {
          "title": "1x1",
          "favicon": "favicon_asset",
          "navmapThumbnail": "scene-thumbnail.png"
        },
        "owner": "",
        "contact": {
          "name": "Sango",
          "email": ""
        },
        "main": "bin/game.js",
        "tags": [],
        "scene": {
          "parcels": [
            "110,-29"
          ],
          "base": "110,-29"
        },
        "communications": {
          "type": "webrtc",
          "signalling": "https://signalling-01.decentraland.org"
        },
        "policy": {
          "contentRating": "E",
          "fly": true,
          "voiceEnabled": true,
          "blacklist": [],
          "teleportPosition": ""
        },
        "source": {
          "version": 1,
          "origin": "builder",
          "projectId": "e7d8a42d-9166-4a5e-a027-42619d852bc9",
          "point": {
            "x": 110,
            "y": -29
          },
          "rotation": "south",
          "layout": {
            "rows": 1,
            "cols": 1
          }
        }
      }
    }
  ],
  "filters": {},
  "pagination": {
    "offset": 0,
    "limit": 500,
    "moreData": true
  }
}
