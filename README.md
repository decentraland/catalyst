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

## Contributing

The main purpose of this repository is to continue evolving React core, making it faster and easier to use. Development of React happens in the open on GitHub, and we are grateful to the community for contributing bugfixes and improvements. Read below to learn how you can take part in improving React.

### [Code of Conduct](https://github.com/decentraland/catalyst/blob/master/docs/CODE_OF_CONDUCT.md)

Please read [the full text](https://github.com/decentraland/catalyst/blob/master/docs/CODE_OF_CONDUCT.md) so that you can understand what actions will and will not be tolerated.

### [Contributing Guide](https://github.com/decentraland/catalyst/blob/master/docs/CONTRIBUTING.md)

Read our [contributing guide](https://github.com/decentraland/catalyst/blob/master/docs/CONTRIBUTING.md) to learn about our development process, how to propose bugfixes and improvements, and how to build and test your changes.

## Release

- Create a tag release in Git
- It will trigger the CI job which publishes a new docker image version under `@latest` tag
