import React from 'react'
import moment from 'moment';
import { LinkContent } from '../components/LinkContent';
import { Position } from '../components/Position';

export function DisplayScene(props: { scene: any }) {
  const name = props.scene?.metadata?.display?.title || "Untitled scene";
  const length = props.scene?.pointers.length;
  return (
    <div>
      <p>
        <strong>{name}</strong> ({length} parcel{length === 1 ? "" : "s"}, base: <Position coordinate={props.scene?.metadata?.scene?.base} />)
        <br/>
        Deployed {moment(props.scene.timestamp).fromNow()} <br/>id: <LinkContent hash={props.scene.id} /> 
      </p>
    </div>
  );
}
