import { AuthLinkType, Entity, EntityType } from "@dcl/schemas";
import { AuditInfo } from "dcl-catalyst-commons";
import { createFsComponent } from '../../../../src/ports/fs';
import { DeploymentContext, DeploymentResult } from "../../../../src/service/Service";
import { AppComponents } from "../../../../src/types";
import { makeNoopServerValidator } from "../../../helpers/service/validations/NoOpValidator";
import { loadStandaloneTestEnvironment, testCaseWithComponents } from "../../E2ETestEnvironment";
import { EntityCombo } from "../../E2ETestUtils";
import { getIntegrationResourcePathFor } from '../../resources/get-resource-path';

const fs = createFsComponent()

loadStandaloneTestEnvironment()("Integration - Deployment synced old entity", (testEnv) => {

  testCaseWithComponents(
    testEnv,
    "When deploying an old synced entity, it should succeed",
    async (components) => {
      makeNoopServerValidator(components);

      const entity: Entity = {
        "version": "v3",
        "id": "QmYfCVBv7PJCcBh3AutAzNesdGZVKUEd8KCc8Jh1Y8ba4u",
        "type": EntityType.PROFILE,
        "pointers": ["0x4CAb2E350499bAd0eC5941aD6B6995a6a20f0130"],
        "timestamp": 1632416205936,
        "content": [
          {
            "file": "aFile-zjxd",
            "hash": "QmbNcPuVAq6Dv821kfFnyaM59Go3xCeBMnSxYRSHEpwWeF"
          },
          {
            "file": "anotherFile-zjxd",
            "hash": "QmbNcPuVAq6Dv821kfFnyaM59Go3xCeBMnSxYRSHEpwWeF"
          },
          {
            "file": "aThirdFile-zjxd",
            "hash": "QmbNcPuVAq6Dv821kfFnyaM59Go3xCeBMnSxYRSHEpwWeF"
          }]
      }

      const contentFile = await fs.readFile(getIntegrationResourcePathFor('QmbNcPuVAq6Dv821kfFnyaM59Go3xCeBMnSxYRSHEpwWeF'));
      const entityFile = await fs.readFile(getIntegrationResourcePathFor('QmYfCVBv7PJCcBh3AutAzNesdGZVKUEd8KCc8Jh1Y8ba4u'));

      const E1: EntityCombo = {
        deployData: {
          entityId: 'QmYfCVBv7PJCcBh3AutAzNesdGZVKUEd8KCc8Jh1Y8ba4u',
          files: new Map([
            ['QmbNcPuVAq6Dv821kfFnyaM59Go3xCeBMnSxYRSHEpwWeF', contentFile],
            ['QmYfCVBv7PJCcBh3AutAzNesdGZVKUEd8KCc8Jh1Y8ba4u', entityFile]]),
          authChain: [
            {
            "type": AuthLinkType.SIGNER,
            "payload": "0x4CAb2E350499bAd0eC5941aD6B6995a6a20f0130",
            "signature": ""
            },
            {
            "type": AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
            "payload": "QmYfCVBv7PJCcBh3AutAzNesdGZVKUEd8KCc8Jh1Y8ba4u",
            "signature": "0x10c80e802b3d5faea8e253c809d254ec2e17a4b36c50ade38e0a4e7766c320e903aa262a5be9458802d57f0c69b283855d3734848fc7b68467d0749f082700b01b"
            }
            ]
        },
        controllerEntity: entity,
        entity: entity
      }

      const deploymentResult = await deployEntity(components, E1)

      expect( typeof deploymentResult === 'number').toBeTruthy();
    }
  );


  async function deployEntity(
    components: Pick<AppComponents, "deployer">,
    entity: EntityCombo,
    overrideAuditInfo?: Partial<AuditInfo>
  ): Promise<DeploymentResult> {
    const newAuditInfo = { version: 'v3', authChain: entity.deployData.authChain, ...overrideAuditInfo };
    return await components.deployer.deployEntity(
      Array.from(entity.deployData.files.values()),
      entity.deployData.entityId,
      newAuditInfo,
      DeploymentContext.SYNCED
    );
  }
});
