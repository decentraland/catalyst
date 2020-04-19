import React from "react";
import { shortenAddress } from "../comms/Comms";
export function Avatar(props: { userInfo: any; address: string; contentServer: string; position: number[]; serverName: string; layer: string }) {
  if (props.userInfo) {
    if (
      props.userInfo.length &&
      props.userInfo[0].metadata &&
      props.userInfo[0].metadata.avatars &&
      props.userInfo[0].metadata.avatars.length &&
      props.userInfo[0].metadata.avatars[0].avatar &&
      props.userInfo[0].metadata.avatars[0].avatar.snapshots &&
      props.userInfo[0].metadata.avatars[0].avatar.snapshots.face
    ) {
      return (
        <div>
          <img width={50} alt="User avatar" src={props.contentServer + "contents/" + props.userInfo[0].metadata.avatars[0].avatar.snapshots.face} />
          &nbsp;
          {props.userInfo[0].metadata.avatars[0].name}
          &nbsp; (
          {props.position ? (
            <a target="_blank" rel="noopener noreferrer" href={`https://play.decentraland.org/?position=${props.position.join(",")}&realm=${props.serverName}-${props.layer}`}>
              {props.position[0]}, {props.position[1]}
            </a>
          ) : (
            "unknown position"
          )}
          )
        </div>
      );
    }
  }
  return (
    <div>
      <img width={50} alt="Default avatar" src={props.contentServer + "contents/QmeLTsRbiPpgW5ir1q1Ny3dG5znDGRSvWZCBuMgkxV7us9"} />
      &nbsp;
      {shortenAddress(props.address)}
      &nbsp; (
      <a target="_blank" rel="noopener noreferrer" href={`https://play.decentraland.org/?position=${props.position.join(",")}&realm=${props.serverName}-${props.layer}`}>
        {props.position[0]}, {props.position[1]}
      </a>
      )
    </div>
  );
}
