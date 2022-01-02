# Content Server

The content server currently stores many of the entities used in Decentraland. For example scenes, wearables and profiles. Content servers will automatically sync with each other, as long as they were all whitelisted by the DAO.

If you set up a local content server, it will receive all updates by those other whitelisted servers. However, new deployments that happen on your local server will not be sent to other servers.

## Requirements

- You will need to install [docker](https://docs.docker.com/get-docker/)
- You will need to install [yarn](https://classic.yarnpkg.com/en/docs/install/)

## How to run it

- Install libs

  `yarn install`

- Build the project

  `yarn build`

- Start the database

  `yarn start:db`

- Start the content server

  `yarn start:server`

- To connect to the database locally

  `docker exec -it postgres psql -U postgres -d content`

## Configuration

There are many ways to configure the content server. You can provide these configurations when starting the server like this:

`CONFIG_NAME1=CONFIG_VALUE1 CONFIG_NAME2=CONFIG_VALUE2 yarn start:content`

These are some of the more important configuration values:

| Name                | Description                                                                                          |  Default  |
| ------------------- | ---------------------------------------------------------------------------------------------------- | :-------: |
| ETH_NETWORK         | Which Ethereum network you want to use. Usually is `ropsten` for testing or `mainnet` for production | 'ropsten' |
| STORAGE_ROOT_FOLDER | Folder where all content will be stored                                                              | 'storage' |
| SERVER_PORT         | Port to be used by the service                                                                       |   6969    |
| LOG_LEVEL           | Minimum log level                                                                                    |  'info'   |

## Run unit tests

    `yarn test:unit`

## Run integration tests

To run all tests:

    `yarn test:integration`

Every integration test will start a docker container with a postgres database, that will be used just for that test and then it will be stopped and removed.

In case you want to avoid this behaviour, you can start the postgres instance manually by executing `yarn start:db` and then adding `CI` env. variable to skip setup and tear down:

```
  yarn start:db
  CI=true yarn test:integration
```

## Debugging tests

To debug any test you may need the recommended VS Code extensions to discover jasmine tests, then use editor UI to run/debug them.

Note: Typescript must compile to show up UI buttons, otherwise see jasmine console to see more information

Here is an [example](https://user-images.githubusercontent.com/7695773/135918419-7417b26a-f4e9-4a14-96ae-22785c414b9e.gif) showing how it should look.

## Project Structure: History

There are two kind of histories.

### Entities/global history

This is the global history that all content servers agree on. This is determined by the entity timestamp, which can't be modified,
so all content servers should have the same order and agree on 'who overwrote who'. This overwrite information is stored
on the 'deployments' table, with the 'deleter_deployment' field. Each deployment will store who overwrote it (in this global order sense).

### Deployments/local history

This history is local to each content server. It depends on the order that deployments were made, so it will most likely be different for each server. This information is stored on the 'deployment_deltas' table, and exposed by the /pointer-changes endpoint. The idea is that this table will store changes made to the pointers. So if a deployment modifies a pointer in some way, this is where it will be recorded.

Possible modifications to a pointer could be: making the pointer reference the new entity or making the pointer point to nothing. Each deployment will have a reference:

- The modified pointer
- The previous entity the pointer was referring to (if any)
- The changes that occurred (point to new entity or point to nothing).
- It is important to note that a new deployment could have no impact on pointers. This would happen when D1 overwrote D2 (on the global order sense), and the content server locally deployed D1 before D2. In that case, no changes are recorded for that deployment.
