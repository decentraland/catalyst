# Lighthouse

## Projects

- Lighthouse - Communications coordinator
- Communications peer library
- Example client

## Set up

* Install libs

    `yarn install`

* Set up a lighthouse instance on localhost:9000

    `yarn bazel run comms/lighthouse:server`

* Set up a client server on localhost:3001

    `yarn bazel run comms/peer-react-app:devserver`

* Open the client

    `open localhost:3001`

## Running it with docker

* Build the image

    `docker build . -t decentraland/katalyst:latest`

* Modify the .env file to set your configuration

* Run it locally:
    ```
    docker run -ti --rm --name comms   --env-file .env -p 9000:9000 katalyst:latest comms
    docker run -ti --rm --name content --env-file .env -p 6969:6969 katalyst:latest content
    docker run -ti --rm --name lambdas --env-file .env -p 7070:7070 katalyst:latest lambdas
    ```

* Run it with compose:

    `docker-compose up`

* Give it a try:
    ```
    curl http://localhost:9000/rooms
    curl http://localhost:6969/status
    ```


## Lighthouse endpoints

Try the following endpoints for a minimal monitoring of the rooms state.

* List of rooms

    `curl localhost:9000/rooms`

* List of rooms joined curreently by user

    `curl localhost:9000/rooms\?userId=${USER_ID}`
* Join user to room

    `curl -X PUT localhost:9000/rooms/${ROOM_ID} -d '{ "id": "${USER_ID}" }' -H "Content-Type: application/json"`

* Leave user from room

    `curl -X DELETE localhost:9000/rooms/${ROOM_ID}/users/${USER_ID}`

* List of users in room

    `curl localhost:9000/rooms/${ROOM_ID}`