import React from "react";
import ReactDOM from "react-dom";

import Viz from "viz.js";
import { Module, render } from "viz.js/full.render.js";

async function renderTopology() {
  const layersResponse = await fetch("/layers");
  const layers = await layersResponse.json();

  if (layers.length === 0) {
    const element = document.createElement("p");
    const text = document.createTextNode("No layers found! Join peers first maybe?");
    element.appendChild(text);
    document.body.appendChild(element);
  } else {
    await renderLayers(layers);
  }
}

async function renderLayers(layers) {
  let viz = new Viz({ Module, render });

  for (const layer of layers) {
    const h1 = document.createElement("h1");
    const text = document.createTextNode("Layer " + layer);
    h1.appendChild(text);
    document.body.appendChild(h1);

    const response = await fetch("/layers/blue/topology?format=graphviz");
    const topology = await response.text();
    console.log("topology", topology);

    viz
      .renderSVGElement(topology)
      .then(element => document.body.appendChild(element))
      .catch(error => {
        // Create a new Viz instance (@see Caveats page for more info)
        viz = new Viz();

        const element = document.createElement("p");
        const text = document.createTextNode("Error while rendering layer");
        element.appendChild(text);
        document.body.appendChild(element);

        console.error(error);
      });
  }
}

renderTopology();

function App() {
  return <p>react test</p>;
}

export default function renderApp() {
  ReactDOM.render(<App />, document.getElementById("root"));
}

renderApp();
