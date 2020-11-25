import { loadTestEnvironment } from "../../E2ETestEnvironment";
import { buildDeployData } from "../../E2ETestUtils";
import { buildDeployment, buildEvent } from "../../E2EAssertions";
import assert from "assert";
import { TestServer } from "../../TestServer";
import ms from "ms";
import { SortingField, SortingOrder, Timestamp } from "dcl-catalyst-commons";

/**
 * This test verifies that all deployment sorting params are working correctly
 */
fdescribe("Integration - Deployment Filters", () => {
  const SYNC_INTERVAL: number = ms("1s");
  const testEnv = loadTestEnvironment();
  let server: TestServer;

  beforeEach(async () => {
    [server] = await testEnv.configServer(SYNC_INTERVAL).andBuildMany(3);
  });

  it(`When getting all deployments without sortby then the order is by local and desc`, async () => {
    // Start server
    await Promise.all([server.start()]);

    // Prepare data to be deployed
    await deployToServer(server);
    await deployToServer(server);
    await deployToServer(server);

    const deployments = await server.getDeployments();
    assert.equal(3, deployments.length, `Expected to find 3 deployments on server ${server.getAddress()}. Instead, found ${deployments.length}.`);

    // Make sure that deployments are sorted per descending local timestamp
    for (let i = 1; i < deployments.length; i++) {
      assert.ok(deployments[i - 1].auditInfo.localTimestamp > deployments[i].auditInfo.localTimestamp);
    }
  });

  it(`When getting all deployments with sortby by local and asc then the order is correct`, async () => {
    // Start server
    await Promise.all([server.start()]);

    // Prepare data to be deployed
    await deployToServer(server);
    await deployToServer(server);
    await deployToServer(server);

    const deployments = await server.getDeployments(undefined, { field: SortingField.LOCAL_TIMESTAMP, order: SortingOrder.ASCENDING });
    assert.equal(3, deployments.length, `Expected to find 3 deployments on server ${server.getAddress()}. Instead, found ${deployments.length}.`);

    // Make sure that deployments are sorted per descending local timestamp
    for (let i = 1; i < deployments.length; i++) {
      assert.ok(deployments[i - 1].auditInfo.localTimestamp < deployments[i].auditInfo.localTimestamp);
    }
  });

  it(`When getting all deployments with sortby by origin and asc then the order is correct`, async () => {
    // Start server
    await Promise.all([server.start()]);

    // Prepare data to be deployed
    await deployToServer(server);
    await deployToServer(server);
    await deployToServer(server);

    const deployments = await server.getDeployments(undefined, { field: SortingField.ORIGIN_TIMESTAMP, order: SortingOrder.ASCENDING });
    assert.equal(3, deployments.length, `Expected to find 3 deployments on server ${server.getAddress()}. Instead, found ${deployments.length}.`);

    // Make sure that deployments are sorted per descending local timestamp
    for (let i = 1; i < deployments.length; i++) {
      assert.ok(deployments[i - 1].auditInfo.originTimestamp < deployments[i].auditInfo.originTimestamp);
    }
  });

  it(`When getting all deployments with sortby by origin and desc then the order is correct`, async () => {
    // Start server
    await Promise.all([server.start()]);

    // Prepare data to be deployed
    await deployToServer(server);
    await deployToServer(server);
    await deployToServer(server);

    const deployments = await server.getDeployments(undefined, { field: SortingField.ORIGIN_TIMESTAMP, order: SortingOrder.DESCENDING });
    assert.equal(3, deployments.length, `Expected to find 3 deployments on server ${server.getAddress()}. Instead, found ${deployments.length}.`);

    // Make sure that deployments are sorted per descending local timestamp
    for (let i = 1; i < deployments.length; i++) {
      assert.ok(deployments[i - 1].auditInfo.originTimestamp > deployments[i].auditInfo.originTimestamp);
    }
  });

  it(`When getting all deployments with sortby by entity and asc then the order is correct`, async () => {
    // Start server
    await Promise.all([server.start()]);

    // Prepare data to be deployed
    await deployToServer(server);
    await deployToServer(server);
    await deployToServer(server);

    const deployments = await server.getDeployments(undefined, { field: SortingField.ENTITY_TIMESTAMP, order: SortingOrder.ASCENDING });
    assert.equal(3, deployments.length, `Expected to find 3 deployments on server ${server.getAddress()}. Instead, found ${deployments.length}.`);

    // Make sure that deployments are sorted per descending local timestamp
    for (let i = 1; i < deployments.length; i++) {
      assert.ok(deployments[i - 1].entityTimestamp < deployments[i].entityTimestamp);
    }
  });

  it(`When getting all deployments with sortby by entity and desc then the order is correct`, async () => {
    // Start server
    await Promise.all([server.start()]);

    // Prepare data to be deployed
    await deployToServer(server);
    await deployToServer(server);
    await deployToServer(server);

    const deployments = await server.getDeployments(undefined, { field: SortingField.ORIGIN_TIMESTAMP, order: SortingOrder.DESCENDING });
    assert.equal(3, deployments.length, `Expected to find 3 deployments on server ${server.getAddress()}. Instead, found ${deployments.length}.`);

    // Make sure that deployments are sorted per descending local timestamp
    for (let i = 1; i < deployments.length; i++) {
      assert.ok(deployments[i - 1].entityTimestamp > deployments[i].entityTimestamp);
    }
  });
});

async function deployToServer(server: TestServer) {
  const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(["X1,Y1"], { metadata: "metadata" });
  const deploymentTimestamp: Timestamp = await server.deploy(deployData);
  buildEvent(entityBeingDeployed, server, deploymentTimestamp);
  buildDeployment(deployData, entityBeingDeployed, server, deploymentTimestamp);
}
