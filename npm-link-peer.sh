#!/bin/bash

BUILD_OUTPUT=$(yarn bazel run //comms/peer:package.pack 2>&1)

REGEX='(decentraland-katalyst-peer-[0-9]*\.[0-9]*\.[0-9]*\.tgz)'

if [[ $BUILD_OUTPUT =~ $REGEX ]] ; then
    ZIP_FILENAME=${BASH_REMATCH[1]}
    rm -rf linked-peer-package
    tar -xzvf $ZIP_FILENAME
    rm $ZIP_FILENAME
    mv package linked-peer-package
    cd linked-peer-package
    npm link
fi

