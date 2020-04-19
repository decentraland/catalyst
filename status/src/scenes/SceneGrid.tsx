import React from "react";
import useSWR from "swr";
import { DisplayError } from "../components/DisplayError";
import { fetchJSON } from "../components/fetchJSON";
import { contentServer } from "../layout/App";
import { DisplayScene } from "./ScenesList";

export function SceneGrid(props: { scenes: string[] }) {
  const { data, error } = useSWR(contentServer + "entities/scenes?id=" + props.scenes.join("&id="), fetchJSON);
  return (
    <div>
      <h3>Last Submitted Scenes</h3>
      {data && data.map((_: any) => <DisplayScene scene={_} />)}
      {error && <DisplayError error={error} />}
    </div>
  );
}
