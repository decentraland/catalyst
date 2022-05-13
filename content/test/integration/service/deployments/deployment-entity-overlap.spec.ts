import { AuditInfo, EntityType, EntityVersion, Timestamp } from "dcl-catalyst-commons";
import {
  DeploymentContext,
  DeploymentResult,
  isInvalidDeployment,
  isSuccessfulDeployment
} from "../../../../src/service/Service";
import { AppComponents } from "../../../../src/types";
import { makeNoopServerValidator } from "../../../helpers/service/validations/NoOpValidator";
import { loadStandaloneTestEnvironment, testCaseWithComponents } from "../../E2ETestEnvironment";
import { buildDeployData, buildDeployDataAfterEntity, EntityCombo } from "../../E2ETestUtils";
import { stub } from "sinon";

/**
 * This test verifies that after a parcel changed owner, a new deployment from new owner is allowed
 * and previous overlapping scenes end up with no scene.
 */
loadStandaloneTestEnvironment()("Integration - Deployment with Entity Overlaps", (testEnv) => {
  const P1 = "0,0";
  const P2 = "0,1";
  const P3 = "1,1";
  let E1: EntityCombo, E2: EntityCombo;

  beforeEach(async () => {
    E1 = await buildDeployData([P1, P2], {
      type: EntityType.SCENE,
      metadata: {
        main: "main.js",
        scene: {
          base: P1,
          parcels: [P1, P2]
        }
      }
    });
  });

  testCaseWithComponents(
    testEnv,
    "When parcel changes owner, then new deployment by new owner succeeds and removes previous scenes from other parcels",
    async (components) => {
      // make noop server validator
      makeNoopServerValidator(components);

      // make stub validator
      // TODO The real validator is built in a way we have no access to mock its externalCalls, so
      //  we can't mock queryGraph responses.
      //  Only option I found is by mocking the responses this way
      stub(components.validator, "validate")
        .onFirstCall()
        .resolves({ok: true})
        .onSecondCall()
        .resolves({ok: true})
        // .callThrough()
        // .resolves({
        //   ok: false,
        //   errors: [
        //     `The provided Eth Address does not have access to the following parcel: (${P2})`,
        //     `The provided Eth Address does not have access to the following parcel: (${P3})`
        //   ]
        // })
        // .callsFake((args: any) => {
        //   console.log("validator called with", args);
        //   return Promise.resolve({
        //     ok: false,
        //     errors: [
        //       `The provided Eth Address does not have access to the following parcel: (${P2})`,
        //       `The provided Eth Address does not have access to the following parcel: (${P3})`
        //     ]
        //   });
        //   // return Promise.resolve({ ok: true })
        // });

      // Deploy E1 on P1, P2
      await deploy(components, E1);
      await assertDeploymentsAre(components, E1);

      // Change ownership of P2
      // Nothing to do really, as the mock above already allows it

      // Deploy E2 on P2, P3
      E2 = await buildDeployDataAfterEntity(E1, [P2, P3], {
        type: EntityType.SCENE,
        metadata: {
          main: "main.js",
          scene: {
            base: P2,
            parcels: [P2, P3]
          }
        },
      });

      await deploy(components, E2);
      await assertDeploymentsAre(components, E2); // E1 should have no scenes now
    }
  );

  async function assertDeploymentsAre(
    components: Pick<AppComponents, "deployer">,
    ...expectedEntities: EntityCombo[]
  ) {
    const actualDeployments = await components.deployer.getDeployments();
    console.log(actualDeployments);
    const expectedEntityIds = expectedEntities.map((entityCombo) => entityCombo.entity.id).sort();
    const actualEntityIds = actualDeployments.deployments.map(({ entityId }) => entityId).sort();
    expect({ deployedEntityIds: actualEntityIds }).toEqual({ deployedEntityIds: expectedEntityIds });
  }

  async function deploy(components: Pick<AppComponents, "deployer">, ...entities: EntityCombo[]): Promise<Timestamp[]> {
    return deployWithAuditInfo(components, entities, {});
  }

  async function deployWithAuditInfo(
    components: Pick<AppComponents, "deployer">,
    entities: EntityCombo[],
    overrideAuditInfo?: Partial<AuditInfo>
  ) {
    const result: Timestamp[] = [];
    for (const { deployData } of entities) {
      const newAuditInfo = { version: EntityVersion.V3, authChain: deployData.authChain, ...overrideAuditInfo };
      const deploymentResult: DeploymentResult = await components.deployer.deployEntity(
        Array.from(deployData.files.values()),
        deployData.entityId,
        newAuditInfo,
        DeploymentContext.LOCAL
      );
      if (isSuccessfulDeployment(deploymentResult)) {
        result.push(deploymentResult);
      } else if (isInvalidDeployment(deploymentResult)) {
        throw new Error(deploymentResult.errors.join(","));
      } else {
        throw new Error("deployEntity returned invalid result" + JSON.stringify(deploymentResult));
      }
    }
    return result;
  }
});
