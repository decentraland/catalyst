# AI Agent Context

**Service Purpose:** Monorepo containing the core Catalyst server implementation. Catalyst servers are the decentralized content infrastructure for Decentraland, bundling multiple services (Content Server, Lambdas, BFF, Archipelago) to provide entity storage, content delivery, peer communication, and client APIs.

**Key Capabilities:**

- **Content Server**: Stores and syncs entities (scenes, wearables, profiles) across DAO-approved Catalysts with automatic replication
- **Lambdas Service**: Provides utility APIs for clients to query entities, validate ownership, resolve assets, and interact with Catalyst content
- **Backend for Frontend (BFF)**: Manages P2P signaling for peer-to-peer communication between Decentraland clients
- **Archipelago Integration**: Groups peers into clusters/islands for efficient communication (via separate archipelago-workers service)
- **LiveKit Integration**: Provides SFU-based WebRTC communication for high-performance crowd scenarios
- **Entity Validation**: Uses @dcl/content-validator to validate all entity deployments before storage

**Communication Pattern:**
- Synchronous HTTP REST API (Content Server, Lambdas)
- Real-time WebSocket/P2P (BFF, Archipelago)
- NATS messaging between internal services

**Technology Stack:**

- Runtime: Node.js
- Language: TypeScript
- HTTP Framework: @well-known-components/http-server
- Database: PostgreSQL (content metadata)
- Storage: IPFS/local file system (entity content)
- Component Architecture: @well-known-components (logger, metrics, http-server, pg-component)

**External Dependencies:**

- Database: PostgreSQL (deployment metadata, content file references, snapshots)
- Content Validator: @dcl/content-validator (entity validation)
- Blockchain: Ethereum providers, The Graph subgraphs (ownership validation)
- Storage: IPFS or local storage for entity content files
- Message Broker: NATS (inter-service communication)
- Communication: LiveKit (WebRTC SFU), Archipelago service (island clustering)

**Project Structure:**

- `content/`: Content Server implementation (entity storage, deployment handling, sync)
- `lambdas/`: Lambdas service (utility APIs, entity queries, ownership validation)
- Services are orchestrated via Catalyst Owner deployment

**Database Schema:**

- **Tables**: `deployments` (entity deployments), `content_files` (file references), `failed_deployments` (validation failures), `active_pointers` (pointer mappings), `snapshots` (sync state), `processed_snapshots` (sync tracking), `system_properties` (config)
- **Key Columns**: `deployments.entity_id` (unique), `deployments.entity_pointers` (array), `active_pointers.pointer` (PK), `snapshots.hash`
- **Full Documentation**: See [content/docs/database-schema.md](content/docs/database-schema.md) for detailed schema, column definitions, example queries, migration history, and relationships

**API Specification:** Implements Catalyst API v1 specification (see catalyst-api-specs repository)
