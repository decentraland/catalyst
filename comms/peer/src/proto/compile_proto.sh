protoc --plugin=../../../../node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=. ./peer_protobuf.proto

sed -i 's/global\.//g' peer_protobuf.ts

sed -i 's:message\.dst\.push(e);://@ts-ignore\n        message.dst.push(e);:g' peer_protobuf.ts
