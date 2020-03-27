protoc --plugin=../../../../../node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=. ./comms.proto

sed -i 's/global\.//g' comms.ts

sed -i 's:message\.dst\.push(e);://@ts-ignore\n        message.dst.push(e);:g' comms.ts
