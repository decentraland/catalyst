# Get health

Get the health status for each server running in catalyst

**URL** : `/lambdas/health`

**Method** : `GET`

**Auth required** : NO

**Permissions required** : NO

## Success Response

**Condition** : -

**Code** : `200 OK`

**Content example**

```json

{
    "commsStatus": "Healthy",
    "contentStatus": "Unhealthy",
    "lambdaStatus": "Healthy"
}

```
