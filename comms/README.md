# Lighthouse / Comms Server
Comms is comprised of two distinct modules: One for Catalyst server called "Lighthouse" and other for clients & P2P network called "Peer Library".

The Lighthouse is an server that tracks peers in different "layers" and "rooms" in order to enable them to make the necessary connections. It also handles authentication.

The following docs show how to run a local instance of the Lighthouse, and how to run a simple react app that serves to test the local lighthouse.

## Set up

* Install libs

    `yarn install`

* Set up a lighthouse instance on localhost:9000

    `yarn bazel run comms/lighthouse:server`

* Set up a client server on localhost:3001

    `yarn bazel run comms/peer-react-app:devserver`

* Open the client

    `open localhost:3001`

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
