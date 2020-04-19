import React from "react";
import useSWR from "swr";
import { DisplayError } from "../components/DisplayError";
import { fetchJSON } from "../components/fetchJSON";
import { Profile } from "./Profile";
import { contentServer } from "../layout/App";
export function ProfilesGrid(props: {
  profiles: string[];
}) {
  const { data, error } = useSWR(contentServer + "entities/profiles?id=" + props.profiles.join("&id="), fetchJSON);
  return (<div>
    <h3>Last Submitted Profiles</h3>
    {data && data.map((_: any) => <Profile profile={_} />)}
    {error && <DisplayError error={error} />}
  </div>);
}
