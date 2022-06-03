# Catalyst Project

A Catalyst is a server that bundles different services. These services currently work as the backbone for Decentraland and run the decentralized storage for most of the content needed by the client and orchestrate the communications between peers.

If you just want to run a Catalyst server, please check the [Catalyst Owner](https://github.com/decentraland/catalyst-owner) repository. The current repository is mostly used for developing.

The architecture of the server is as follows:
![Server](architecture/architecture.svg)


- [Backend for Frontend](https://github.com/decentraland/explorer-bff) (BFF)
This service was created to resolve client needs to enable faster development of new features without breaking the existing APIs. In the Catalyst context, it's used for the communications between peers connected to the client, its main responsibility is to manage the P2P signaling.

- [Archipelago Service](https://github.com/decentraland/archipelago-service)
Previously Archipelago was a [library](https://github.com/decentraland/archipelago) used by the [Lighthouse](https://github.com/decentraland/lighthouse), as now it needs to work with the different transports beyond P2P, it was converted into a Service. This service will have the same responsibility that the library did: group peers in clusters so they can communicate efficiently. On the other hand, the service will also need to be able to balance islands using the available transports and following a set of Catalyst Owner defined rules, in order to, for example, use LiveKit for an island in the Casino and P2P in a Plaza.

- [NATS](https://nats.io/)
NATS is a message broker that enables the data exchange and communication between services. This is also a building block for future developments and will enable an easy way to connect services using subject-based messaging. In the context of the communication services architecture, it is used to communicate the BFF, Archipelago and LiveKit.

- [LiveKit](https://livekit.io/)
LiveKit is an open source project that provides scalable, multi-user conferencing over WebRTC. Instead of doing a P2P network, peers are connected to a [Selective Forwarding Unit](https://github.com/decentraland/comms3-livekit-transport) (SFU) in charge of managing message relay and different quality aspects of the communication. This will be the added infrastructure in order to provide high-performance/high-quality communications between crowds on designated scenes.

- [Lambdas](lambdas): This service provides a set of utilities required by the Catalyst Server Clients/Consumers in order to retrieve or validate data.
Some of the validations run in these functions are ownership related and for that it uses [The Graph](https://thegraph.com/hosted-service/subgraph/decentraland/collections-matic-mainnet) to query the blockchain.

- [Content Server](content): The Content Server currently stores many of the [Entities](https://github.com/decentraland/common-schemas/tree/main/src/platform) used in Decentraland. For example scenes, wearables and profiles. Content Servers will automatically sync with each other, as long as they were all approved by the [DAO](http://governance.decentraland.org/). If you set up a local content server, it will receive all updates by those other DAO Catalysts. However, new deployments that happen on your local server will not be sent to other servers.
- [Nginx](https://nginx.org/en/docs/) is the reverse proxy used to route traffic to the Catalysts Services.

The [Catalyst Client](https://github.com/decentraland/catalyst-client) library can be used to interact with the Catalyst servers. You can both fetch data, or deploy new entities to the server you specify.

Check full architecture [here](https://github.com/decentraland/architecture)

## Catalyst API

This Server implements the v1 of the API Specification detailed [here](https://github.com/decentraland/catalyst-api-specs)

## Monitoring

For monitoring see [the following doc](docs/MONITORING.md)

## Tests

```
yarn build
yarn test
```

## Contributing

### [Code of Conduct](https://github.com/decentraland/catalyst/blob/main/docs/CODE_OF_CONDUCT.md)

Please read [the full text](https://github.com/decentraland/catalyst/blob/main/docs/CODE_OF_CONDUCT.md) so that you can understand what actions will and will not be tolerated.

### [Contributing Guide](https://github.com/decentraland/catalyst/blob/main/docs/CONTRIBUTING.md)

Read our [contributing guide](https://github.com/decentraland/catalyst/blob/main/docs/CONTRIBUTING.md) to learn about our development process, how to propose bugfixes and improvements, and how to build and test your changes.

## Release

- Create a tag release in Git
- It will trigger the CI job which publishes a new docker image version under `@latest` tag
