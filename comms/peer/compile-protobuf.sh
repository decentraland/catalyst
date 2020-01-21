#!/bin/bash

function is_protoc_in_path {
  if [[ -n $ZSH_VERSION ]]; then
    builtin whence -p protoc &> /dev/null
  else  # bash:
    builtin type -P protoc &> /dev/null
  fi
}

if is_protoc_in_path; then
  protoc src/proto/peer.proto --plugin="protoc-gen-ts=../../node_modules/ts-protoc-gen/bin/protoc-gen-ts" --js_out="import_style=commonjs,binary:." --ts_out="."
else
  echo "This script equires protobuf `protoc` compiler to be in PATH. Install it and then try again."
  exit 1
fi