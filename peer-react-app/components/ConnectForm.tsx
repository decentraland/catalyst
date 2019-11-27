import React, { useState } from "react";
import { Field, Button } from "decentraland-ui";

function fieldFor(label: string, value: string, setter: (s: string) => any) {
    return <Field label={label} onChange={ev => setter(ev.target.value)} value={value} />
}

export function ConnectForm() {
    const [url, setUrl] = useState('');
    const [nickname, setNickname] = useState('');
    const [room, setRoom] = useState('');
    return <div className="connect-form">
        {fieldFor("URL", url, setUrl)}
        {fieldFor("Nickname", nickname, setNickname)}
        {fieldFor("Room", room, setRoom)}
        
        <Button primary disabled>Connect</Button>
    </div>
}