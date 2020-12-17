/* eslint-disable @typescript-eslint/ban-types */
import { Reader, Writer } from 'protobufjs/minimal'

export interface CommsMessage {
  time: number
  positionData: PositionData | undefined
  profileData: ProfileData | undefined
  chatData: ChatData | undefined
  sceneData: SceneData | undefined
}

export interface PositionData {
  positionX: number
  positionY: number
  positionZ: number
  rotationX: number
  rotationY: number
  rotationZ: number
  rotationW: number
}

export interface ProfileData {
  profileVersion: string
  userId: string
}

export interface ChatData {
  messageId: string
  text: string
}

export interface SceneData {
  sceneId: string
  text: string
}

const baseCommsMessage: object = {
  time: 0
}

const basePositionData: object = {
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  rotationW: 0
}

const baseProfileData: object = {
  profileVersion: '',
  userId: ''
}

const baseChatData: object = {
  messageId: '',
  text: ''
}

const baseSceneData: object = {
  sceneId: '',
  text: ''
}

export const CommsMessage = {
  encode(message: CommsMessage, writer: Writer = Writer.create()): Writer {
    writer.uint32(9).double(message.time)
    if (message.positionData !== undefined && message.positionData !== undefined) {
      PositionData.encode(message.positionData, writer.uint32(18).fork()).ldelim()
    }
    if (message.profileData !== undefined && message.profileData !== undefined) {
      ProfileData.encode(message.profileData, writer.uint32(26).fork()).ldelim()
    }
    if (message.chatData !== undefined && message.chatData !== undefined) {
      ChatData.encode(message.chatData, writer.uint32(34).fork()).ldelim()
    }
    if (message.sceneData !== undefined && message.sceneData !== undefined) {
      SceneData.encode(message.sceneData, writer.uint32(42).fork()).ldelim()
    }
    return writer
  },
  decode(reader: Reader, length?: number): CommsMessage {
    const end = length === undefined ? reader.len : reader.pos + length
    const message = Object.create(baseCommsMessage) as CommsMessage
    while (reader.pos < end) {
      const tag = reader.uint32()
      switch (tag >>> 3) {
        case 1:
          message.time = reader.double()
          break
        case 2:
          message.positionData = PositionData.decode(reader, reader.uint32())
          break
        case 3:
          message.profileData = ProfileData.decode(reader, reader.uint32())
          break
        case 4:
          message.chatData = ChatData.decode(reader, reader.uint32())
          break
        case 5:
          message.sceneData = SceneData.decode(reader, reader.uint32())
          break
        default:
          reader.skipType(tag & 7)
          break
      }
    }
    return message
  },
  fromJSON(object: any): CommsMessage {
    const message = Object.create(baseCommsMessage) as CommsMessage
    if (object.time !== undefined && object.time !== null) {
      message.time = Number(object.time)
    } else {
      message.time = 0
    }
    if (object.positionData !== undefined && object.positionData !== null) {
      message.positionData = PositionData.fromJSON(object.positionData)
    } else {
      message.positionData = undefined
    }
    if (object.profileData !== undefined && object.profileData !== null) {
      message.profileData = ProfileData.fromJSON(object.profileData)
    } else {
      message.profileData = undefined
    }
    if (object.chatData !== undefined && object.chatData !== null) {
      message.chatData = ChatData.fromJSON(object.chatData)
    } else {
      message.chatData = undefined
    }
    if (object.sceneData !== undefined && object.sceneData !== null) {
      message.sceneData = SceneData.fromJSON(object.sceneData)
    } else {
      message.sceneData = undefined
    }
    return message
  },
  fromPartial(object: DeepPartial<CommsMessage>): CommsMessage {
    const message = Object.create(baseCommsMessage) as CommsMessage
    if (object.time !== undefined && object.time !== null) {
      message.time = object.time
    } else {
      message.time = 0
    }
    if (object.positionData !== undefined && object.positionData !== null) {
      message.positionData = PositionData.fromPartial(object.positionData)
    } else {
      message.positionData = undefined
    }
    if (object.profileData !== undefined && object.profileData !== null) {
      message.profileData = ProfileData.fromPartial(object.profileData)
    } else {
      message.profileData = undefined
    }
    if (object.chatData !== undefined && object.chatData !== null) {
      message.chatData = ChatData.fromPartial(object.chatData)
    } else {
      message.chatData = undefined
    }
    if (object.sceneData !== undefined && object.sceneData !== null) {
      message.sceneData = SceneData.fromPartial(object.sceneData)
    } else {
      message.sceneData = undefined
    }
    return message
  },
  toJSON(message: CommsMessage): unknown {
    const obj: any = {}
    obj.time = message.time || 0
    obj.positionData = message.positionData ? PositionData.toJSON(message.positionData) : undefined
    obj.profileData = message.profileData ? ProfileData.toJSON(message.profileData) : undefined
    obj.chatData = message.chatData ? ChatData.toJSON(message.chatData) : undefined
    obj.sceneData = message.sceneData ? SceneData.toJSON(message.sceneData) : undefined
    return obj
  }
}

export const PositionData = {
  encode(message: PositionData, writer: Writer = Writer.create()): Writer {
    writer.uint32(13).float(message.positionX)
    writer.uint32(21).float(message.positionY)
    writer.uint32(29).float(message.positionZ)
    writer.uint32(37).float(message.rotationX)
    writer.uint32(45).float(message.rotationY)
    writer.uint32(53).float(message.rotationZ)
    writer.uint32(61).float(message.rotationW)
    return writer
  },
  decode(reader: Reader, length?: number): PositionData {
    const end = length === undefined ? reader.len : reader.pos + length
    const message = Object.create(basePositionData) as PositionData
    while (reader.pos < end) {
      const tag = reader.uint32()
      switch (tag >>> 3) {
        case 1:
          message.positionX = reader.float()
          break
        case 2:
          message.positionY = reader.float()
          break
        case 3:
          message.positionZ = reader.float()
          break
        case 4:
          message.rotationX = reader.float()
          break
        case 5:
          message.rotationY = reader.float()
          break
        case 6:
          message.rotationZ = reader.float()
          break
        case 7:
          message.rotationW = reader.float()
          break
        default:
          reader.skipType(tag & 7)
          break
      }
    }
    return message
  },
  fromJSON(object: any): PositionData {
    const message = Object.create(basePositionData) as PositionData
    if (object.positionX !== undefined && object.positionX !== null) {
      message.positionX = Number(object.positionX)
    } else {
      message.positionX = 0
    }
    if (object.positionY !== undefined && object.positionY !== null) {
      message.positionY = Number(object.positionY)
    } else {
      message.positionY = 0
    }
    if (object.positionZ !== undefined && object.positionZ !== null) {
      message.positionZ = Number(object.positionZ)
    } else {
      message.positionZ = 0
    }
    if (object.rotationX !== undefined && object.rotationX !== null) {
      message.rotationX = Number(object.rotationX)
    } else {
      message.rotationX = 0
    }
    if (object.rotationY !== undefined && object.rotationY !== null) {
      message.rotationY = Number(object.rotationY)
    } else {
      message.rotationY = 0
    }
    if (object.rotationZ !== undefined && object.rotationZ !== null) {
      message.rotationZ = Number(object.rotationZ)
    } else {
      message.rotationZ = 0
    }
    if (object.rotationW !== undefined && object.rotationW !== null) {
      message.rotationW = Number(object.rotationW)
    } else {
      message.rotationW = 0
    }
    return message
  },
  fromPartial(object: DeepPartial<PositionData>): PositionData {
    const message = Object.create(basePositionData) as PositionData
    if (object.positionX !== undefined && object.positionX !== null) {
      message.positionX = object.positionX
    } else {
      message.positionX = 0
    }
    if (object.positionY !== undefined && object.positionY !== null) {
      message.positionY = object.positionY
    } else {
      message.positionY = 0
    }
    if (object.positionZ !== undefined && object.positionZ !== null) {
      message.positionZ = object.positionZ
    } else {
      message.positionZ = 0
    }
    if (object.rotationX !== undefined && object.rotationX !== null) {
      message.rotationX = object.rotationX
    } else {
      message.rotationX = 0
    }
    if (object.rotationY !== undefined && object.rotationY !== null) {
      message.rotationY = object.rotationY
    } else {
      message.rotationY = 0
    }
    if (object.rotationZ !== undefined && object.rotationZ !== null) {
      message.rotationZ = object.rotationZ
    } else {
      message.rotationZ = 0
    }
    if (object.rotationW !== undefined && object.rotationW !== null) {
      message.rotationW = object.rotationW
    } else {
      message.rotationW = 0
    }
    return message
  },
  toJSON(message: PositionData): unknown {
    const obj: any = {}
    obj.positionX = message.positionX || 0
    obj.positionY = message.positionY || 0
    obj.positionZ = message.positionZ || 0
    obj.rotationX = message.rotationX || 0
    obj.rotationY = message.rotationY || 0
    obj.rotationZ = message.rotationZ || 0
    obj.rotationW = message.rotationW || 0
    return obj
  }
}

export const ProfileData = {
  encode(message: ProfileData, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.profileVersion)
    writer.uint32(18).string(message.userId)
    return writer
  },
  decode(reader: Reader, length?: number): ProfileData {
    const end = length === undefined ? reader.len : reader.pos + length
    const message = Object.create(baseProfileData) as ProfileData
    while (reader.pos < end) {
      const tag = reader.uint32()
      switch (tag >>> 3) {
        case 1:
          message.profileVersion = reader.string()
          break
        case 2:
          message.userId = reader.string()
          break
        default:
          reader.skipType(tag & 7)
          break
      }
    }
    return message
  },
  fromJSON(object: any): ProfileData {
    const message = Object.create(baseProfileData) as ProfileData
    if (object.profileVersion !== undefined && object.profileVersion !== null) {
      message.profileVersion = String(object.profileVersion)
    } else {
      message.profileVersion = ''
    }
    if (object.userId !== undefined && object.userId !== null) {
      message.userId = String(object.userId)
    } else {
      message.userId = ''
    }
    return message
  },
  fromPartial(object: DeepPartial<ProfileData>): ProfileData {
    const message = Object.create(baseProfileData) as ProfileData
    if (object.profileVersion !== undefined && object.profileVersion !== null) {
      message.profileVersion = object.profileVersion
    } else {
      message.profileVersion = ''
    }
    if (object.userId !== undefined && object.userId !== null) {
      message.userId = object.userId
    } else {
      message.userId = ''
    }
    return message
  },
  toJSON(message: ProfileData): unknown {
    const obj: any = {}
    obj.profileVersion = message.profileVersion || ''
    obj.userId = message.userId || ''
    return obj
  }
}

export const ChatData = {
  encode(message: ChatData, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.messageId)
    writer.uint32(18).string(message.text)
    return writer
  },
  decode(reader: Reader, length?: number): ChatData {
    const end = length === undefined ? reader.len : reader.pos + length
    const message = Object.create(baseChatData) as ChatData
    while (reader.pos < end) {
      const tag = reader.uint32()
      switch (tag >>> 3) {
        case 1:
          message.messageId = reader.string()
          break
        case 2:
          message.text = reader.string()
          break
        default:
          reader.skipType(tag & 7)
          break
      }
    }
    return message
  },
  fromJSON(object: any): ChatData {
    const message = Object.create(baseChatData) as ChatData
    if (object.messageId !== undefined && object.messageId !== null) {
      message.messageId = String(object.messageId)
    } else {
      message.messageId = ''
    }
    if (object.text !== undefined && object.text !== null) {
      message.text = String(object.text)
    } else {
      message.text = ''
    }
    return message
  },
  fromPartial(object: DeepPartial<ChatData>): ChatData {
    const message = Object.create(baseChatData) as ChatData
    if (object.messageId !== undefined && object.messageId !== null) {
      message.messageId = object.messageId
    } else {
      message.messageId = ''
    }
    if (object.text !== undefined && object.text !== null) {
      message.text = object.text
    } else {
      message.text = ''
    }
    return message
  },
  toJSON(message: ChatData): unknown {
    const obj: any = {}
    obj.messageId = message.messageId || ''
    obj.text = message.text || ''
    return obj
  }
}

export const SceneData = {
  encode(message: SceneData, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.sceneId)
    writer.uint32(18).string(message.text)
    return writer
  },
  decode(reader: Reader, length?: number): SceneData {
    const end = length === undefined ? reader.len : reader.pos + length
    const message = Object.create(baseSceneData) as SceneData
    while (reader.pos < end) {
      const tag = reader.uint32()
      switch (tag >>> 3) {
        case 1:
          message.sceneId = reader.string()
          break
        case 2:
          message.text = reader.string()
          break
        default:
          reader.skipType(tag & 7)
          break
      }
    }
    return message
  },
  fromJSON(object: any): SceneData {
    const message = Object.create(baseSceneData) as SceneData
    if (object.sceneId !== undefined && object.sceneId !== null) {
      message.sceneId = String(object.sceneId)
    } else {
      message.sceneId = ''
    }
    if (object.text !== undefined && object.text !== null) {
      message.text = String(object.text)
    } else {
      message.text = ''
    }
    return message
  },
  fromPartial(object: DeepPartial<SceneData>): SceneData {
    const message = Object.create(baseSceneData) as SceneData
    if (object.sceneId !== undefined && object.sceneId !== null) {
      message.sceneId = object.sceneId
    } else {
      message.sceneId = ''
    }
    if (object.text !== undefined && object.text !== null) {
      message.text = object.text
    } else {
      message.text = ''
    }
    return message
  },
  toJSON(message: SceneData): unknown {
    const obj: any = {}
    obj.sceneId = message.sceneId || ''
    obj.text = message.text || ''
    return obj
  }
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[P] extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : T[P] extends Date | Function | Uint8Array | undefined
    ? T[P]
    : T[P] extends infer U | undefined
    ? DeepPartial<U>
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P]
}
