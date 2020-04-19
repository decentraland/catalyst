import React from "react";
import { navigate } from "hookrouter";
export function Sidebar(props: { active: string; setActive: (path: string) => void }) {
  const areas: any[] = [
    ["/", "", "header link", "Catalyst Manager"],
    ["/comms", "comms", "link", "Comms"],
    ["/dao", "dao", "link", "DAO"],
    ["/denylist", "denylist", "link", "Denylist"],
    ["/scenes", "scenes", "link", "Scenes"],
    ["/profiles", "profiles", "link", "Profiles"],
  ].map((_) => {
    const url = _[0];
    if (url === props.active) {
      _[2] = _[2] + " active";
    }
    return _
  });
  console.log(areas, 'sidebar')
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
