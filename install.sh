#!/usr/bin/env bash

UUID="$(jq -r ".uuid" metadata.json)"
EXTENSIONS_DIR="${HOME}/.local/share/gnome-shell/extensions"
LINK_NAME="${EXTENSIONS_DIR}/${UUID}"

show_usage() {
    echo "Использование: ${0##*/} [-i] [-u] [-l] [-h]"
    echo "  -i           установить это расширение"
    echo "  -u           удалить (деинсталлировать) это расширение"
    echo "  -l           вывести список установленных расширений"
    echo "  -h           показать эту справку"
}

if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    show_usage
    exit 0
fi

if [ "$1" == "-l" ]; then
    echo "---"
    ls --color -Al "${EXTENSIONS_DIR}"
    exit
fi

if [ "$1" == "-i" ] || [ "$1" == "--install" ]; then
    if [ -e "${LINK_NAME}" ]; then
        echo "Расширение уже установлено: ${LINK_NAME}"
    else
        ln -s "${PWD}" ${LINK_NAME} && echo "Расширение успешно установлено."
    fi
    exit 0
fi

case "$1" in
    -u|--uninstall)
        if [ ! -e "${LINK_NAME}" ]; then
            echo "Расширение не установлено: ${LINK_NAME}"
            exit 0
        fi
        if [ ! -L "${LINK_NAME}" ]; then
            echo "Ошибка: ${LINK_NAME} существует, но это НЕ ссылка — удалять вручную не буду (не трогаю чужое)."
            exit 1
        fi
        # Целевой путь настоящей ссылки — для понятного подтверждения.
        TARGET="$(readlink "${LINK_NAME}")"
        echo "Будет удалена ссылка: ${LINK_NAME}"
        echo "  → ${TARGET}"
        read -r -p "Точно удалить? Введите YES для подтверждения: " REPLY
        if [ "${REPLY}" != "YES" ]; then
            echo "Отменено."
            exit 0
        fi
        rm "${LINK_NAME}"
        echo "Расширение удалено."
        exit 0
        ;;
    "")
        # Без аргументов — только справка (безопасный дефолт, ничего не делаем).
        show_usage
        exit 0
        ;;
    *)
        echo "Неизвестный аргумент: $1" >&2
        show_usage
        exit 1
        ;;
esac