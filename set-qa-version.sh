#!/usr/bin/env bash
# set-qa-version.sh — временная пометка версии для QA-тестирования (см. docs/qa/PROCESS.md).
#
# На время тестирования (особенно вне devkit — на хосте/в VM) вписывает в
# "description" в metadata.json короткий хэш текущего HEAD, чтобы по
# показаниям интерфейса («Расширения» / gnome-extensions info) можно было
# верифицировать, какая версия кода фактически загружена (Shell кэширует
# код при старте сессии).
#
# Использование:
#   ./set-qa-version.sh          # вписать хэш: "... (build abc1234)"
#   ./set-qa-version.sh --clean  # убрать хэш (перед коммитом итерации)
#
# Примечание: semver-инкремент "version" при завершении ветки — отдельный
# шаг по конвенции, этот скрипт "version" не трогает.

set -euo pipefail

cd "$(dirname "$0")"

SHORT_HASH="$(git rev-parse --short HEAD)"
MODE="set"
if [ "${1:-}" = "--clean" ]; then
    MODE="clean"
fi

if [ "$MODE" = "set" ]; then
    jq --arg h "$SHORT_HASH" '
        .description |= (
            if test(" \\(build [0-9a-fA-F]+\\)$") then
                gsub(" \\(build [0-9a-fA-F]+\\)$"; " (build " + $h + ")")
            else
                . + " (build " + $h + ")"
            end
        )
    ' metadata.json > metadata.json.tmp
    mv metadata.json.tmp metadata.json
    echo "QA-version: (build $SHORT_HASH) вписан в description"
else
    jq '.description |= gsub(" \\(build [0-9a-fA-F]+\\)$"; "")' \
        metadata.json > metadata.json.tmp
    mv metadata.json.tmp metadata.json
    echo "QA-version: хэш убран из description"
fi

jq -r '"description: " + .description' metadata.json