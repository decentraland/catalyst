import { DAOClient } from "decentraland-katalyst-commons/src/DAOClient";
import { ServerMetadata } from "decentraland-katalyst-commons/src/ServerMetadata";
import { noReject } from "decentraland-katalyst-commons/src/util";

const defaultNames = ["zeus", "athena", "hera", "hephaestus", "aphrodite", "hades", "hermes", "artemis", "thor", "loki", "odin", "freyja", "fenrir", "heimdallr", "baldr"];

export async function pickName(configuredNames: string | undefined, daoClient: DAOClient) {
  const existingNames: string[] = await getLighthousesNames(daoClient);

  const namesList = (configuredNames?.split(",")?.map(it => it.trim()) ?? defaultNames).filter(it => !existingNames.includes(it));

  if (namesList.length === 0) throw new Error("Could not set my name! Names taken: " + existingNames);

  const pickedName = namesList[Math.floor(Math.random() * namesList.length)];

  return pickedName;
}

async function getLighthousesNames(daoClient: DAOClient) {
  const servers = await daoClient.getAllServers();
  const namePromises = await Promise.all(
    Array.from(servers)
      .map(getName)
      .map(noReject)
  );
  const existingNames: string[] = namePromises.filter(result => result[0] === "fulfilled").map(result => result[1]);
  return existingNames;
}

async function getName(server: ServerMetadata): Promise<string> {
  //Timeout is an option that is supported server side, but not browser side, so it doesn't compile if we don't cast it to any
  try {
    const statusResponse = await fetch(`${server.address}/comms/status`, { timeout: 5000 } as any);
    if (statusResponse.ok) {
      const json = await statusResponse.json();
      return json.name;
    }

    throw new Error(`Response not OK. Response status: ${statusResponse.status}`);
  } catch (e) {
    console.warn(`Error while getting the name of ${server.address}, id: ${server.id}`, e.message);
    throw e;
  }
}
