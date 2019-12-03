# Lighthouse

## Projects

- Lighthouse - Communications coordinator
- Communications peer library
- Example client

## Set up

```
yarn install
# lighthouse
yarn bazel run lighthouse:server # sets up a lighthouse instance on localhost:9000 by default
# example client
yarn bazel run peer-react-app:devserver # sets up the client server on localhost:3001 by default
# open client
open localhost:3001
```

## Lighthouse endpoints

Try the following endpoints for a minimal monitoring of the rooms state.

```
# list of rooms
curl localhost:9000/rooms
# list of rooms joined curreently by user
curl localhost:9000/rooms\?userId=$USER_ID
# join user to room
curl -X PUT localhost:9000/rooms/$ROOM_ID -d '{ "id": "$USER_ID" }' -H "Content-Type: application/json"
# leave user from room
curl -X DELETE localhost:9000/rooms/$ROOM_ID/users/$USER_ID
# list of users in room
curl localhost:9000/rooms/$ROOM_ID
```
