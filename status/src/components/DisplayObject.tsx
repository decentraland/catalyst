import React from "react";

export function DisplayObject(props: { object: any }) {
  const content = props.object;
  return (
    <ul>
      {content &&
        Object.keys(content).map((_) => {
          return (
            <li key={_}>
              {_}: <strong>{typeof content[_] === "object" ? "object" : content[_]}</strong>
            </li>
          );
        })}
    </ul>
  );
}
