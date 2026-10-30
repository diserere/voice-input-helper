#!/usr/bin/env bash

# Перезапуск расширения через gnome-extensions (disable/enable).
# Важно: в основной сессии так перечитывается только stylesheet.css —
# JS-код кэшируется (ES-модули), для его обновления нужен перелогин или
# devkit-сессия (./run-gnome-shell-devkit.sh).

UUID="$(jq -r ".uuid" metadata.json)" || exit $?
EXT_NAME="Расширение \"${UUID}\""

show_usage() {
    echo "Использование: ${0##*/} [-e] [-d] [-h]"
    echo "  (без аргументов)  перезапустить расширение (disable + enable)"
    echo "  -e                включить расширение"
    echo "  -d                выключить расширение"
    echo "  -h                показать эту справку"
    echo
    echo "Перезапуск перечитывает только стили (CSS); изменения JS"
    echo "подхватываются лишь после перелогина или в devkit-сессии."
}

case "$1" in
    -h|--help)
        show_usage
        exit 0
        ;;
    -e|--enable)
        gnome-extensions enable "${UUID}" || exit $?
        echo "${EXT_NAME} включено."
        ;;
    -d|--disable)
        gnome-extensions disable "${UUID}" || exit $?
        echo "${EXT_NAME} выключено."
        ;;
    "")
        gnome-extensions disable "${UUID}" && gnome-extensions enable "${UUID}" || exit $?
        echo "${EXT_NAME} перезапущено (перечитаны только стили)."
        ;;
    *)
        echo "Неизвестный аргумент: $1" >&2
        show_usage
        exit 1
        ;;
esac
