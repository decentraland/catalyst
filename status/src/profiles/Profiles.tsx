import React from "react";
import useSWR from "swr";
import { fetchJSON } from "../components/fetchJSON";
import { ProfilesGrid } from "./ProfilesGrid";
import { contentServer } from "../layout/App";
export function Profiles() {
  const { data } = useSWR(contentServer + "history", fetchJSON);
  return (
    <div>
      {data && (
        <ProfilesGrid
          profiles={data.events
            .filter((_: any) => _.entityType === "profile")
            .slice(0, 10)
            .map((_: any) => _.entityId)}
        />
      )}
    </div>
  );
}
