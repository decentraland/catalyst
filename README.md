# Catalyst Project

A Catalyst is a server that runs different services. These services currently work as the backbone for Decentraland. Some of these project are:

- Lighthouse - Communications coordinator
- Communications peer library
- Content Server

If you just want to run a Catalyst server, please check the [Catalyst Owner](https://github.com/decentraland/catalyst-owner) repository. This repository is mostly used for developing.

## Services

- [Content Server](content)
- [Lighthouse](comms)

## Monitoring

For monitoring see [the following doc](docs/MONITORING.md)

## Contributions

If using Visual Studio, please download:

- [`prettier` extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [`eslint` extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

### Install Husky
```
yarn add husky
yarn husky install
yarn husky add .husky/pre-commit "yarn lint-staged"
```
