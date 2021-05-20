# Lambdas Server

## Requirements

* You will need to install [docker](https://docs.docker.com/get-docker/)
* You will need to install [yarn](https://classic.yarnpkg.com/en/docs/install/)


## How to run it

* Install libs

    `yarn install`

* Start the content server

    `yarn bazel run lambdas:server`


## Configuration

You can provide these configurations when starting the server like this:

`CONFIG_NAME1=CONFIG_VALUE1 CONFIG_NAME2=CONFIG_VALUE2 yarn bazel run lambdas:server`

These are some of the more important configuration values when running locally:

| Name | Description | Default |
|------|-------------|:-----:|
| COMMS_SERVER_ADDRESS | Comms server address. Will only be used when the service is running outside of docker | - |
| CONTENT_SERVER_ADDRESS | Content server address. Will only be used when the service is running outside of docker | - |
| LOG_LEVEL | Minimum log level | 'info' |

## Run unit tests
    `yarn bazel run lambdas:unit_test`

## Run integration tests
    `yarn bazel run lambdas:integration_test`
