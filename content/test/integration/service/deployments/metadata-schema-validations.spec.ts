import { EntityType } from "@dcl/schemas";
import { AuditInfo, EntityVersion } from "dcl-catalyst-commons";
import { DeploymentContext, DeploymentResult } from "../../../../src/service/Service";
import { AppComponents } from "../../../../src/types";
import { makeNoopServerValidator } from "../../../helpers/service/validations/NoOpValidator";
import { loadStandaloneTestEnvironment, testCaseWithComponents } from "../../E2ETestEnvironment";
import { buildDeployData, createIdentity, EntityCombo } from "../../E2ETestUtils";

loadStandaloneTestEnvironment()("Integration - Deployment with metadata validation", (testEnv) => {

  testCaseWithComponents(
    testEnv,
    "When scene metadata is missing, deployment result should include the proper error",
    async (components) => {
      makeNoopServerValidator(components);

      const P1 = "0,0";
      const P2 = "0,1";
      let E1: EntityCombo = await buildDeployData([P1, P2], {
        type: EntityType.SCENE,
        metadata: { a: 'metadata' }
      });

      expect(await deployEntity(components, E1))
        .toEqual({
          errors: [
            "The metadata for this entity type (scene) is not valid.",
            "should have required property 'main'",
            "should have required property 'scene'"
          ]
        });
    }
  );

  testCaseWithComponents(
    testEnv,
    "When scene metadata is present but incomplete, deployment result should include the proper errors",
    async (components) => {
      makeNoopServerValidator(components);

      const P1 = "0,0";
      const P2 = "0,1";
      let E1: EntityCombo = await buildDeployData([P1, P2], {
        type: EntityType.SCENE,
        metadata: {
        }
      });

      expect(await deployEntity(components, E1))
        .toEqual({
          errors: [
            "The metadata for this entity type (scene) is not valid.",
            "should have required property 'main'",
            "should have required property 'scene'"
          ]
        });
    }
  );

  testCaseWithComponents(
    testEnv,
    "When scene metadata is present but incomplete (missing scene), deployment result should include the proper error",
    async (components) => {
      makeNoopServerValidator(components);

      const P1 = "0,0";
      const P2 = "0,1";
      let E1: EntityCombo = await buildDeployData([P1, P2], {
        type: EntityType.SCENE,
        metadata: {
          main: "main.js"
        }
      });

      expect(await deployEntity(components, E1))
        .toEqual({
          errors: [
            "The metadata for this entity type (scene) is not valid.",
            "should have required property 'scene'"
          ]
        });
    }
  );

  testCaseWithComponents(
    testEnv,
    "When scene metadata is present and ok, deployment fail because of permissions validator",
    async (components) => {
      makeNoopServerValidator(components);

      const P1 = "0,0";
      const P2 = "0,1";
      const identity = createIdentity();

      let E1: EntityCombo = await buildDeployData([P1, P2], {
        type: EntityType.SCENE,
        metadata: {
          main: "main.js",
          scene: {
            base: P1,
            parcels: [P1, P2]
          }
        },
        identity,
      });

      expect(await deployEntity(components, E1))
        .toEqual({
          errors: [
            "The provided Eth Address does not have access to the following parcel: (0,0)",
            "The provided Eth Address does not have access to the following parcel: (0,1)"
          ]
        });
    }
  );

  testCaseWithComponents(
    testEnv,
    "When profile metadata is missing, deployment result should include the proper error",
    async (components) => {
      makeNoopServerValidator(components);

      const identity = createIdentity();
      let E1: EntityCombo = await buildDeployData([identity.address], {
        type: EntityType.PROFILE,
        metadata: { a: 'metadata' },
        identity,
      });

      expect(await deployEntity(components, E1))
        .toEqual({
          errors: [
            "The metadata for this entity type (profile) is not valid.",
            "should have required property 'avatars'"
          ]
        });
    }
  );

  testCaseWithComponents(
    testEnv,
    "When profile metadata is present but incomplete (missing avatars), deployment result should include the proper error",
    async (components) => {
      makeNoopServerValidator(components);

      const identity = createIdentity();
      let E1: EntityCombo = await buildDeployData([identity.address], {
        type: EntityType.PROFILE,
        metadata: {
        },
        identity,
      });

      expect(await deployEntity(components, E1))
        .toEqual({
          errors: [
            "The metadata for this entity type (profile) is not valid.",
            "should have required property 'avatars'"
          ]
        });
    }
  );

  testCaseWithComponents(
    testEnv,
    "When wearable metadata is wrong, deployment result should include the proper error",
    async (components) => {
      makeNoopServerValidator(components);

      const identity = createIdentity();
      let E1: EntityCombo = await buildDeployData([identity.address], {
        type: EntityType.WEARABLE,
        metadata: { a: 'metadata' },
        identity,
      });

      expect(await deployEntity(components, E1))
        .toEqual({
          errors: [
            "The metadata for this entity type (wearable) is not valid.",
            "for standard wearables \"merkleProof\" and \"content\" are not allowed",
            "for third party wearables \"collectionAddress\" and \"rarity\" are not allowed",
            "should match exactly one schema in oneOf",
            "should have required property 'id'",
            "should have required property 'description'",
            "should have required property 'name'",
            "should have required property 'data'",
            "should have required property 'thumbnail'",
            "should have required property 'image'",
            "should have required property 'i18n'",
          ]
        });
    }
  );

  testCaseWithComponents(
    testEnv,
    "When wearable metadata is present but incomplete, deployment result should include the proper error",
    async (components) => {
      makeNoopServerValidator(components);

      const identity = createIdentity();
      let E1: EntityCombo = await buildDeployData([identity.address], {
        type: EntityType.WEARABLE,
        metadata: {
        },
        identity,
      });

      expect(await deployEntity(components, E1))
        .toEqual({
          errors: [
            "The metadata for this entity type (wearable) is not valid.",
            "for standard wearables \"merkleProof\" and \"content\" are not allowed",
            "for third party wearables \"collectionAddress\" and \"rarity\" are not allowed",
            "should match exactly one schema in oneOf",
            "should have required property 'id'",
            "should have required property 'description'",
            "should have required property 'name'",
            "should have required property 'data'",
            "should have required property 'thumbnail'",
            "should have required property 'image'",
            "should have required property 'i18n'",
          ]
        });
    }
  );

  async function deployEntity(
    components: Pick<AppComponents, "deployer">,
    entity: EntityCombo,
    overrideAuditInfo?: Partial<AuditInfo>
  ): Promise<DeploymentResult> {
    const newAuditInfo = { version: EntityVersion.V3, authChain: entity.deployData.authChain, ...overrideAuditInfo };
    return await components.deployer.deployEntity(
      Array.from(entity.deployData.files.values()),
      entity.deployData.entityId,
      newAuditInfo,
      DeploymentContext.LOCAL
    );
  }
});
