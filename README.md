# Catalyst Server

[![Coverage Status](https://coveralls.io/repos/github/decentraland/catalyst/badge.svg?branch=main)](https://coveralls.io/github/decentraland/catalyst?branch=main)

A Catalyst is a server that bundles different services. These services currently work as the backbone for Decentraland and run the decentralized storage for the content needed by clients.

If you just want to run a Catalyst server, please check the [Catalyst Owner](https://github.com/decentraland/catalyst-owner) repository. The current repository is mostly used for development.

## Table of Contents

- [Features](#features)
- [Dependencies & Related Services](#dependencies--related-services)
- [API Documentation](#api-documentation)
- [Database](#database)
  - [Schema](#schema)
  - [Migrations](#migrations)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Service](#running-the-service)
- [Testing](#testing)
  - [Running Tests](#running-tests)
  - [Test Structure](#test-structure)
- [AI Agent Context](#ai-agent-context)

## Features

This bundle of services exposes two main gateways for clients to interact with.

### Content

- **Entities Deployment**: Stores most of the [entities](https://github.com/decentraland/schemas/tree/main/src/platform) used in Decentraland. It performs validations for the entities received using their schemas and [custom run-time validations](https://github.com/decentraland/content-validator) to ensure they are acceptable to the node network. The entity information is stored in a PostgreSQL database and their corresponding files live in the filesystem of the node. Every entity deployment gets an entity ID assigned.
- **Entities Sync**: A Catalyst is part of a network of other Catalysts. Every deployment accepted in a node is replicated to the others in the same network. If a deployment fails in a Catalyst, it is stored in a failed_deployments table for later retrieval.
- **Entities Fetch**: Exposes a way to retrieve entity information and their content files directly from the filesystem.

### Lambdas

- **Sanitized Entities Fetch**: Exposes a way to retrieve ownership-validated entities. Upon retrieval, the service validates that the ownership related to an entity is still valid against the blockchain.
- **Sanitized Users Collections**: Exposes a way to retrieve all entities a user owns within the ecosystem. These entities are also backed up against the blockchain upon retrieval.
- **Third Party Entities**: It acts as a gateway to retrieve third-party or external entities in the Decentraland format. This feature is useful to link external NFTs to entities within the ecosystem. As soon as the user holds the NFT on the blockchain, they will hold its linked Decentraland entity.

## Dependencies & Related Services

External dependencies:

- The Graph
- PostgreSQL

## API Documentation

The APIs are fully document using the [OpenAPI standard](https://swagger.io/specification/). The documentation for all services in this bundle can be found in the [documentation page](https://docs.decentraland.org/apis/apis/catalyst/content-server).

## Database

### Schema

See [docs/database-schemas.md](content/docs/database-schemas.md) for detailed schema, column definitions, and relationships used by Content Server. Lambdas do not use any database, it acts as a gateway to retrieve entities stored in Content server.

### Migrations

The service uses `node-pg-migrate` for database migrations. These migrations are located in `src/migrations/`. The service automatically runs the migrations when starting up.

#### Create a new migration

Migrations are created by running the create command:

```bash
yarn migrate create name-of-the-migration
```

This will result in the creation of a migration file inside of the `src/migrations/` directory. This migration file MUST contain the migration set up and rollback procedures.

#### Manually applying migrations

If required, these migrations can be run manually.

To run them manually:

```bash
yarn migrate up
```

To rollback them manually:

```bash
yarn migrate down
```

## Getting Started

### Prerequisites

Before running this service, ensure you have the following installed:

- **Node.js**: Version 24.x or higher (LTS recommended)
- **Yarn**: Version 1.22.x or higher
- **Docker**: For containerized deployment

<!-- List any other dependencies that are required to run the service -->

### Installation

1. Clone the repository:

```bash
git clone https://github.com/decentraland/catalyst.git
cd catalyst
```

2. Install dependencies:

```bash
yarn install
```

3. Build the project:

```bash
yarn build
```

### Configuration

The service uses environment variables for configuration.
Create a `.env` file in the root directory containing the environment variables for the service to run.
Use the `.env.default` variables as an example.

### Running the Service

#### Setting up the environment

These servers can be run in stand-alone or as a bundle. In order to run the whole bundle of services please check the [Catalyst Owner](https://github.com/decentraland/catalyst-owner) repository as the current repository is mostly used for development.

In order to run the servers in a stand-alone way, please do check their specific documentations, for [Lambdas](/lambdas/README.md) and [Content](/content/README.md), and follow the steps explained there.

## Testing

These servers include comprehensive test coverage with both unit and integration tests. Please go to specific server directory and execute the following commands to run their test suites.

### Running Tests

Run all tests with coverage:

```bash
yarn test
```

Run tests in watch mode:

```bash
yarn test --watch
```

Run only unit tests:

```bash
yarn test test/unit
```

Run only integration tests:

```bash
yarn test test/integration
```

### Test Structure

Each server follows this test structure.

- **Unit Tests** (`test/unit/`): Test individual components and functions in isolation
- **Integration Tests** (`test/integration/`): Test the complete request/response cycle

For detailed testing guidelines and standards, refer to our [Testing Standards](https://github.com/decentraland/docs/tree/main/development-standards/testing-standards) documentation.

## AI Agent Context

For detailed AI Agent context, see [docs/ai-agent-context.md](docs/ai-agent-context.md).
