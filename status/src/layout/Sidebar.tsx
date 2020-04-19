import React from "react";
import { navigate } from "hookrouter";
export function Sidebar(props: { active: string; setActive: (path: string) => void }) {
  const areas: any[] = [
    ["/", "", "header link", "Catalyst Manager"],
    ["/comms", "comms", "link", "Comms"],
    ["/scenes", "scenes", "link", "Scenes"],
    ["/profiles", "profiles", "link", "Profiles"],
    ["/denylist", "denylist", "link", "Denylist"],
    ["/dao", "dao", "link", "DAO"],
  ].map((_) => {
    const url = _[0];
    if (url === props.active) {
      _[2] = _[2] + " active";
    }
    return _
  });
  return (
    <div className="sidebar">
      <ul>
        {areas.map(([url, id, className, title]) => {
          return (
            <li key={id} className={className} onClick={() => [navigate(url), props.setActive(url)]}>
              {title}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
