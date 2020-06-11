import { EntityType } from "dcl-catalyst-commons";
import { CompositeDeploymentReporter } from "@katalyst/content/service/reporters/CompositeDeploymentReporter";
import { Entity } from "@katalyst/content/service/Entity";
import { DeploymentReporter } from "@katalyst/content/service/reporters/DeploymentReporter";

describe("Composite Deployment Reporter", () => {

    it(`When no reporters are set, nothing fails`, () => {
        const composite = new CompositeDeploymentReporter([])
        const entity: Entity = new Entity("id", EntityType.SCENE, [], 0)
        composite.reportDeployment(entity, "ethAddress", "origin")
    });

    it(`When many reporters are set, all are called`, () => {
        const mock1 = new MockDeploymentReporter()
        const mock2 = new MockDeploymentReporter()
        const composite = new CompositeDeploymentReporter([mock1, mock2])

        const entity1: Entity = new Entity("id1", EntityType.SCENE, [], 0)
        composite.reportDeployment(entity1, "ethAddress", "origin")

        const entity2: Entity = new Entity("id2", EntityType.SCENE, [], 0)
        composite.reportDeployment(entity2, "ethAddress", "origin")

        expect(mock1.events.length).toEqual(2)
        expect(mock1.events[0].entity.id).toEqual(entity1.id)
        expect(mock1.events[1].entity.id).toEqual(entity2.id)

        expect(mock2.events.length).toEqual(2)
        expect(mock2.events[0].entity.id).toEqual(entity1.id)
        expect(mock2.events[1].entity.id).toEqual(entity2.id)
    });

})

class MockDeploymentReporter implements DeploymentReporter {

    events: {entity: Entity, ethAddress: string, origin: string}[] = []

    reportDeployment(entity: Entity, ethAddress: string, origin: string): void {
        this.events.push({entity, ethAddress, origin})
    }
}