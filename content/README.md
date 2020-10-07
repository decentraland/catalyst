# Content Server
The content server currently stores many of the entities used in Decentraland. For example scenes, wearables and profiles. Content servers will automatically sync with each other, as long as they were all whitelisted by the DAO.

If you set up a local content server, it will receive all updates by those other whitelisted servers. However, new deployments that happen on your local server will not be sent to other servers.

## Requirements

* You will need to install [docker](https://docs.docker.com/get-docker/)
* You will need to install [yarn](https://classic.yarnpkg.com/en/docs/install/)


## How to run it

* Install libs

    `yarn install`

* Start the database

    `yarn bazel run content:db`

* Start the content server

    `yarn bazel run content:server`


## Configuration

There are many ways to configure the content server. You can provide these configurations when starting the server like this:

`CONFIG_NAME1=CONFIG_VALUE1 CONFIG_NAME2=CONFIG_VALUE2 yarn bazel run content:server`

These are some of the more important configuration values:
| Name | Description | Default |
|------|-------------|:-----:|:-----:|
| ETH_NETWORK | Which Ethereum network you want to use. Usually is `ropsten` for testing or `mainnet` for production | 'ropsten' |
| STORAGE_ROOT_FOLDER | Folder where all content will be stored | 'storage' |
| SERVER_PORT | Port to be used by the service | 6969 |
| LOG_LEVEL | Minimum log level | 'info' |
