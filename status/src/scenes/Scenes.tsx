import React from "react";
import useSWR from "swr";
import { fetchJSON } from "../components/fetchJSON";
import { contentServer } from "../layout/App";
import { SceneGrid } from "./SceneGrid";

export function Scenes() {
  const { data, error } = useSWR(contentServer + "history", fetchJSON);
  return (
    <div>
      {data && (
        <SceneGrid
          scenes={data.events
            .filter((_: any) => _.entityType === "scene")
            .slice(0, 10)
            .map((_: any) => _.entityId)}
        />
      )}
    </div>
  );
}
