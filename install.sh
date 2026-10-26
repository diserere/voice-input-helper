#!/usr/bin/env bash

UUID="$(jq -r ".uuid" metadata.json)"
EXTENSIONS_DIR="${HOME}/.local/share/gnome-shell/extensions"
LINK_NAME="${EXTENSIONS_DIR}/${UUID}"

if [ "$1" == "-l" ]; then
    echo "---"
    ls --color -Al ${EXTENSIONS_DIR}
    exit
fi

if [ -e "${LINK_NAME}" ]; then
    echo "Skip install: target path already exists."; else
    ln -s "${PWD}" ${LINK_NAME} && echo "Extension successfully installed."
fi
