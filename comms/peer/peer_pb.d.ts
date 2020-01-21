import * as $protobuf from "protobufjs";
/** PayloadEncoding enum. */
namespace PayloadEncoding {

    /** BYTES value */
    let BYTES: number;

    /** STRING value */
    let STRING: number;

    /** JSON value */
    let JSON: number;
}

/** Represents a MessageData. */
export class MessageData implements IMessageData {

    /**
     * Constructs a new MessageData.
     * @param [properties] Properties to set
     */
    constructor(properties?: IMessageData);

    /** MessageData room. */
    public room: string;

    /** MessageData dst. */
    public dst: Uint8Array[];

    /** MessageData payload. */
    public payload: Uint8Array;

    /** MessageData encoding. */
    public encoding: PayloadEncoding;

    /**
     * Creates a new MessageData instance using the specified properties.
     * @param [properties] Properties to set
     * @returns MessageData instance
     */
    public static create(properties?: IMessageData): MessageData;

    /**
     * Encodes the specified MessageData message. Does not implicitly {@link MessageData.verify|verify} messages.
     * @param message MessageData message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IMessageData, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified MessageData message, length delimited. Does not implicitly {@link MessageData.verify|verify} messages.
     * @param message MessageData message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IMessageData, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a MessageData message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns MessageData
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): MessageData;

    /**
     * Decodes a MessageData message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns MessageData
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): MessageData;

    /**
     * Verifies a MessageData message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a MessageData message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns MessageData
     */
    public static fromObject(object: { [k: string]: any }): MessageData;

    /**
     * Creates a plain object from a MessageData message. Also converts values to other types if specified.
     * @param message MessageData
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: MessageData, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this MessageData to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Represents a PingData. */
export class PingData implements IPingData {

    /**
     * Constructs a new PingData.
     * @param [properties] Properties to set
     */
    constructor(properties?: IPingData);

    /** PingData pingId. */
    public pingId: number;

    /**
     * Creates a new PingData instance using the specified properties.
     * @param [properties] Properties to set
     * @returns PingData instance
     */
    public static create(properties?: IPingData): PingData;

    /**
     * Encodes the specified PingData message. Does not implicitly {@link PingData.verify|verify} messages.
     * @param message PingData message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IPingData, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified PingData message, length delimited. Does not implicitly {@link PingData.verify|verify} messages.
     * @param message PingData message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IPingData, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a PingData message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns PingData
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): PingData;

    /**
     * Decodes a PingData message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns PingData
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): PingData;

    /**
     * Verifies a PingData message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a PingData message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns PingData
     */
    public static fromObject(object: { [k: string]: any }): PingData;

    /**
     * Creates a plain object from a PingData message. Also converts values to other types if specified.
     * @param message PingData
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: PingData, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this PingData to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Represents a PongData. */
export class PongData implements IPongData {

    /**
     * Constructs a new PongData.
     * @param [properties] Properties to set
     */
    constructor(properties?: IPongData);

    /** PongData pingId. */
    public pingId: number;

    /**
     * Creates a new PongData instance using the specified properties.
     * @param [properties] Properties to set
     * @returns PongData instance
     */
    public static create(properties?: IPongData): PongData;

    /**
     * Encodes the specified PongData message. Does not implicitly {@link PongData.verify|verify} messages.
     * @param message PongData message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IPongData, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified PongData message, length delimited. Does not implicitly {@link PongData.verify|verify} messages.
     * @param message PongData message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IPongData, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a PongData message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns PongData
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): PongData;

    /**
     * Decodes a PongData message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns PongData
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): PongData;

    /**
     * Verifies a PongData message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a PongData message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns PongData
     */
    public static fromObject(object: { [k: string]: any }): PongData;

    /**
     * Creates a plain object from a PongData message. Also converts values to other types if specified.
     * @param message PongData
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: PongData, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this PongData to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Represents a Packet. */
export class Packet implements IPacket {

    /**
     * Constructs a new Packet.
     * @param [properties] Properties to set
     */
    constructor(properties?: IPacket);

    /** Packet sequenceId. */
    public sequenceId: number;

    /** Packet instanceId. */
    public instanceId: string;

    /** Packet timestamp. */
    public timestamp: Long;

    /** Packet src. */
    public src: string;

    /** Packet subtype. */
    public subtype: string;

    /** Packet discardOlderThan. */
    public discardOlderThan: number;

    /** Packet expireTime. */
    public expireTime: number;

    /** Packet hops. */
    public hops: number;

    /** Packet ttl. */
    public ttl: number;

    /** Packet receivedBy. */
    public receivedBy: string[];

    /** Packet messageData. */
    public messageData?: (IMessageData|null);

    /** Packet pingData. */
    public pingData?: (IPingData|null);

    /** Packet pongData. */
    public pongData?: (IPongData|null);

    /** Packet data. */
    public data?: ("messageData"|"pingData"|"pongData");

    /**
     * Creates a new Packet instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Packet instance
     */
    public static create(properties?: IPacket): Packet;

    /**
     * Encodes the specified Packet message. Does not implicitly {@link Packet.verify|verify} messages.
     * @param message Packet message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IPacket, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified Packet message, length delimited. Does not implicitly {@link Packet.verify|verify} messages.
     * @param message Packet message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IPacket, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a Packet message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Packet
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Packet;

    /**
     * Decodes a Packet message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Packet
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): Packet;

    /**
     * Verifies a Packet message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a Packet message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Packet
     */
    public static fromObject(object: { [k: string]: any }): Packet;

    /**
     * Creates a plain object from a Packet message. Also converts values to other types if specified.
     * @param message Packet
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: Packet, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this Packet to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}
