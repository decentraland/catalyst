# Get health

Get the health status for each server running in catalyst

**URL** : `/health`

**Method** : `GET`

**Auth required** : NO

**Permissions required** : NO

## Success Response

**Condition** : -

**Code** : `200 OK`

**Content example**

```json

{
    "comms": "Healthy",
    "content": "Unhealthy",
    "lambda": "Healthy"
}

```
