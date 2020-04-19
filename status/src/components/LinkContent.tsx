import React from "react";
import { contentServer } from "../layout/App";

export function LinkContent(props: { hash: string }) {
  return (
    <a target="_blank" rel="noopener noreferrer" href={`${contentServer}contents/${props.hash}`}>
      {props.hash}
    </a>
  );
}
