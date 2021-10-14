import { PeerTopologyInfo } from '../types'

export function toGraphviz(topology: PeerTopologyInfo[]) {
  return `
  strict digraph graphName {
    concentrate=true
    ${topology.map((it) => `"${it.id}"[label="${it.id}\\nconns:${it.connectedPeers?.length ?? 0}"];`).join('\n')}
    ${topology
      .map((it) =>
        it.connectedPeers?.length
          ? it.connectedPeers.map((connected) => `"${it.id}"->"${connected}";`).join('\n')
          : `"${it.id}";`
      )
      .join('\n')}
  }`
}
