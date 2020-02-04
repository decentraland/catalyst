import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";

import Viz from "viz.js";
import { Module, render } from "viz.js/full.render.js";

let viz = new Viz({ Module, render });

type Layer = {
  name: string;
  maxUsers: number;
  usersCount: number;
}

function LayerSelector(props: { layers: Layer[]; onSelected: (layer: Layer) => any }) {
  return (
    <div>
      <label>
        Select a layer
        <select onChange={ev => props.onSelected(props.layers.find(it => it.name === ev.target.value)!)}>
          {props.layers.map(it => (
            <option value={it.name}>{it.name} ({it.usersCount})</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function LayerTopologyViewer(props: { layer: Layer }) {
  const [topology, setTopology] = useState<string | undefined>(undefined);
  useEffect(() => {
    (async () => {
      const topologyResponse = await fetch(`/layers/${props.layer.name}/topology?format=graphviz`);
      const topologyText = await topologyResponse.text();

      setTopology(topologyText);
    })();
  }, []);

  useEffect(() => {
    if (topology) {
      viz
        .renderSVGElement(topology)
        .then(element => document.getElementById("viz-container")!.appendChild(element))
        .catch(error => {
          // Create a new Viz instance (@see Caveats page for more info)
          viz = new Viz();

          const element = document.createElement("p");
          const text = document.createTextNode("Error while rendering layer");
          element.appendChild(text);
          document.getElementById("viz-container")!.appendChild(element);

          console.error(error);
        });
    }
  }, [topology]);

  return <div id="viz-container"></div>;
}

function App() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [currentLayer, setCurrentLayer] = useState<Layer>();

  useEffect(() => {
    (async () => {
      const layersResponse = await fetch("/layers");
      const layersList = await layersResponse.json();

      setLayers(layersList);
    })();
  }, []);

  return (
    <div>
      <LayerSelector layers={layers} onSelected={setCurrentLayer} />
      {currentLayer && <LayerTopologyViewer layer={currentLayer} />}
    </div>
  );
}

export default function renderApp() {
  ReactDOM.render(<App />, document.getElementById("root"));
}

renderApp();
