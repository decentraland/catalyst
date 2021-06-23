#!/bin/bash

show_separator() {
    printf "\n------------------------------------------------------------\n$1\n------------------------------------------------------------\n"
}

show_separator "Building peer package..."

BUILD_OUTPUT=$(yarn bazel run //comms/peer:package.pack 2>&1 | tee /dev/tty)

REGEX='(dcl-catalyst-peer-\S*\.tgz)'

if [[ $BUILD_OUTPUT =~ $REGEX ]] ; then
    ZIP_FILENAME=${BASH_REMATCH[1]}
    rm -rf linked-peer-package
    show_separator "Unziping ${ZIP_FILENAME}"
    tar -xzvf $ZIP_FILENAME
    rm $ZIP_FILENAME
    mv package linked-peer-package
    cd linked-peer-package
    show_separator "Making NPM Link"
    npm link
fi
