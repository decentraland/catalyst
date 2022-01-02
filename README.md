# Catalyst Project

A Catalyst is a server that runs different services. These services currently work as the backbone for Decentraland. Some of these project are:

- Lighthouse - Communications coordinator
- Communications peer library
- Content Server

If you just want to run a Catalyst server, please check the [Catalyst Owner](https://github.com/decentraland/catalyst-owner) repository. This repository is mostly used for developing.

## Services

- [Content Server](content)
- [Lighthouse](comms)
- [Lambdas](lambdas)
- [PoW](https://github.com/decentraland/pow-authorization-server)

## Catalyst API

This Server implements the v1 of the API Specification detailed [here](https://github.com/decentraland/catalyst-api-specs)

## Monitoring

For monitoring see [the following doc](docs/MONITORING.md)

## Tests

```
yarn build
yarn test
```

## Contributions

If using Visual Studio Code, please install recommended extensions listed in [this file](.vscode/extensions.json).

## Release

- Create a tag release in Git
- It will trigger the CI job which publishes a new docker image version under `@latest` tag
