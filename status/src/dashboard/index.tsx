import React from "react";
import useSWR from "swr";
import { DisplayError } from "../components/DisplayError";
import { DisplayObject } from "../components/DisplayObject";
import { fetchJSON } from "../components/fetchJSON";
import { server } from "../server";

export function Dashboard() {
  const { data, error } = useSWR("https://" + server + "/content/status", fetchJSON);
  const { data: commsData, error: error2 } = useSWR("https://" + server + "/comms/status", fetchJSON);
  const { data: lambdaData, error: error3 } = useSWR("https://" + server + "/lambdas/status", fetchJSON);
  return (
    <div>
      <h2>Server status</h2>
      <h3>Content</h3>
      {data && <DisplayObject object={data} />}
      <h3>Comms</h3>
      {commsData && <DisplayObject object={commsData} />}
      <h3>Lambdas</h3>
      {lambdaData && <DisplayObject object={lambdaData} />}
      {error && <DisplayError error={error} />}
      {error2 && <DisplayError error={error2} />}
      {error3 && <DisplayError error={error3} />}
    </div>
  );
}
