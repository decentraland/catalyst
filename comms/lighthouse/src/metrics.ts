import { Gauge } from 'prom-client'

export const DCL_LIGHTHOUSE_CONNECTED_PEERS_COUNT = new Gauge({
  name: 'dcl_lighthouse_connected_peers_count',
  help: 'Number of connected peers',
  labelNames: []
})

export const DCL_LIGHTHOUSE_ISLANDS_COUNT = new Gauge({
  name: 'dcl_lighthouse_islands_count',
  help: 'Number of alive islands',
  labelNames: []
})
