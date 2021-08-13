# Lighthouse / Comms Server

Comms is comprised of two distinct modules: One for Catalyst server called "Lighthouse" and other for clients & P2P network called "Peer Library".

The Lighthouse is a server that tracks peers in different positions in order to enable them to make the necessary connections. It also handles authentication.

The following docs show how to run a local instance of the Lighthouse.

More information about the Peer Library component is available in this repository: https://github.com/decentraland/catalyst-comms-peer

## Set up

- Install libs

  `yarn install`

- Set up a lighthouse instance on localhost:9000

  `yarn bazel run comms/lighthouse:server`

## Lighthouse endpoints

- Status

  `curl localhost:9000/status`
