# Lambdas Server

## Requirements

- You will need to install [docker](https://docs.docker.com/get-docker/)
- You will need to install [yarn](https://classic.yarnpkg.com/en/docs/install/)

## Run tests

```
yarn build
yarn test
```

## How to run it

- Install libs

  `yarn install`

- Build package

  `yarn build`

- Start the content server

- Start lambdas server
  `CONTENT_SERVER_ADDRESS=localhost:6969 SERVER_PORT=9091 METRICS_PORT=9092 yarn start:server`

## Configuration

You can provide these configurations when starting the server like this:

`CONFIG_NAME1=CONFIG_VALUE1 CONFIG_NAME2=CONFIG_VALUE2 yarn start:lambdas`

These are some of the more important configuration values when running locally:

| Name                          | Description                                                                                                                      | Default |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | :-----: |
| COMMS_SERVER_ADDRESS          | Comms server address. Will only be used when the service is running outside of docker                                            |    -    |
| CONTENT_SERVER_ADDRESS        | Content server address. Will only be used when the service is running outside of docker                                          |    -    |
| LOG_LEVEL                     | Minimum log level                                                                                                                | 'info'  |
| MAX_SYNCHRONIZATION_TIME      | It's the time that the service will allow for the content service to be out of sync before considering it unhealthy              |  '15m'  |
| MAX_DEPLOYMENT_OBTENTION_TIME | It's the max time that the service will allow for the content service to obtain a single deployment before considering it Loaded |  '3s'   |

## Run unit tests

    `yarn test`

## Run integration tests

    `yarn integration-test`
