# AI Agent Context

**Service Purpose:** Core Catalyst Content Server implementation. Catalyst servers are the decentralized content infrastructure for Decentraland, providing entity storage, content delivery, and client APIs.

**Key Capabilities:**

- **Content Server**: Stores and syncs entities (scenes, wearables, profiles) across DAO-approved Catalysts with automatic replication
- **Entity Validation**: Uses @dcl/content-validator to validate all entity deployments before storage

**Communication Pattern:**
- Synchronous HTTP REST API (Content Server)
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

- `src/`: Content Server implementation (entity storage, deployment handling, sync)
- Service is orchestrated via Catalyst Owner deployment

**Database Schema:**

- **Tables**: `deployments` (entity deployments), `content_files` (file references), `failed_deployments` (validation failures), `active_pointers` (pointer mappings), `snapshots` (sync state), `processed_snapshots` (sync tracking), `system_properties` (config)
- **Key Columns**: `deployments.entity_id` (unique), `deployments.entity_pointers` (array), `active_pointers.pointer` (PK), `snapshots.hash`
- **Full Documentation**: See [docs/database-schema.md](database-schema.md) for detailed schema, column definitions, and relationships

**API Specification:** Implements Catalyst API v1 specification (see catalyst-api-specs repository)

## Database

1. **Entity ID Uniqueness**: The `entity_id` column is unique across all entity types (changed from `(entity_id, entity_type)` in migration 1646919812526)

2. **Active Deployments**: A deployment is considered active if `deleter_deployment IS NULL`. Use this condition when querying for current entities.

3. **Metadata Wrapping**: The `entity_metadata` column wraps metadata in `{ v: <actual_metadata> }` structure to allow arbitrary JSON while maintaining type safety.

4. **Pointer Arrays**: The `entity_pointers` column uses PostgreSQL array type with GIN indexing for efficient queries. Use array operators like `&&` (overlap) and `@>` (contains) for queries.

5. **Timestamp Handling**: Timestamps are stored as PostgreSQL TIMESTAMP. In code, they're converted from milliseconds (entity timestamps) or seconds (local timestamps).

6. **Content File Storage**: Content files themselves are stored separately (IPFS or local storage). The `content_files` table only stores references.

7. **Synchronization**: The `snapshots` and `processed_snapshots` tables are used for Catalyst-to-Catalyst synchronization. The `active_pointers` table is maintained for fast pointer lookups.

8. **Failed Deployments**: Failed deployments are stored to prevent re-processing during synchronization. The `snapshot_hash` links failures to specific synchronization events.

9. **Case Sensitivity**: Pointer lookups should use lowercase for consistency (handled in application layer).

10. **Migration System**: Migrations are managed via `node-pg-migrate` and executed automatically on server startup.
