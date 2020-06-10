import { env, envTLD } from "dcl-ops-lib/domain";
import { buildStatic } from "dcl-ops-lib/buildStatic";
import { globalConfig } from "dcl-ops-lib/values";

const { defaultSecurityGroupName } = globalConfig[env]

async function main() {
  const builder = buildStatic({
    path: "./www/",
    domain: `catalysts.decentraland.${envTLD}`,
  });

  return {
    cloudfrontDistribution: builder.cloudfrontDistribution,
    bucketName: builder.contentBucket,
  };
}
export = main;
