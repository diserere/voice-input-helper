#!/usr/bin/env bash

UUID="$(jq -r ".uuid" metadata.json)"
EXTENSIONS_DIR="${HOME}/.local/share/gnome-shell/extensions"
LINK_NAME="${EXTENSIONS_DIR}/${UUID}"

show_usage() {
    echo "Использование: ${0##*/} [-i] [-u] [-l] [-n] [-h]"
    echo "  -i           установить это расширение"
    echo "  -u           удалить (деинсталлировать) это расширение"
    echo "  -l           вывести список установленных расширений"
    echo "  -n           вывести имя (UUID) расширения из metadata.json"
    echo "  -h           показать эту справку"
}

# Убедиться, что каталог расширений существует. Нужен всем операциям, кроме
# справки и ошибок; при отсутствии каталога предлагаем создать его.
ensure_extensions_dir() {
    if [ -d "${EXTENSIONS_DIR}" ]; then
        return 0
    fi
    echo "Каталог расширений не найден: ${EXTENSIONS_DIR}"
    read -r -p "Создать его? [Y/n]: " REPLY
    case "${REPLY}" in
        ""|Y|y|yes|YES|Yes)
            mkdir -p "${EXTENSIONS_DIR}" || {
                echo "Ошибка: не удалось создать ${EXTENSIONS_DIR}" >&2
                exit 1
            }
            echo "Создан: ${EXTENSIONS_DIR}"
            ;;
        *)
            echo "Каталог расширений необходим для работы скрипта. Выход."
            exit 1
            ;;
    esac
}

# Справка (в т.ч. при отсутствии аргументов) и неизвестные аргументы
# обрабатываются сразу, без обращения к каталогу расширений.
case "$1" in
    -h|--help|"")
        show_usage
        exit 0
        ;;
    -n|--name)
        echo "${UUID}"
        exit 0
        ;;
    -l|--list|-i|--install|-u|--uninstall)
        # Валидные операции: продолжаем и готовим каталог расширений.
        ;;
    *)
        echo "Неизвестный аргумент: $1" >&2
        show_usage
        exit 1
        ;;
esac

ensure_extensions_dir

case "$1" in
    -l|--list)
        echo "---"
        ls --color -Al "${EXTENSIONS_DIR}"
        exit 0
        ;;
    -i|--install)
        if [ -e "${LINK_NAME}" ]; then
            echo "Расширение уже установлено: ${LINK_NAME}"
        else
            ln -s "${PWD}" ${LINK_NAME} && echo "Расширение успешно установлено."
        fi
        exit 0
        ;;
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
esac