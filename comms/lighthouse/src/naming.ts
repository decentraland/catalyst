const defaultNames = ["zeus", "athena", "hera", "hephaestus", "aphrodite", "hades", "hermes", "artemis", "thor", "loki", "odin", "freyja", "fenrir", "heimdallr", "baldr"];

export async function getOrCheckName(configuredNames?: string) {
  const namesList = configuredNames?.split(",")?.map(it => it.trim()) ?? defaultNames;

  //For now we just return a random name in the list.
  //After we connect this with the DAO, we will check which names are available, or fail if none

  return namesList[Math.floor(Math.random() * namesList.length)];
}
