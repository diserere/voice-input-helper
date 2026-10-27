# Справочник ссылок — Voice Input Helper

Подборка внешней документации и источников по технической составляющей проекта. Каждая ссылка — с коротким комментарием «что это и зачем смотреть».

> Примечание: официальных русскоязычных источников по GNOME Shell/расширениям практически нет — подавляющее большинство документации на английском языке.

## 1. Myna и диктовка

- **[Ubuntu Speech-to-Text (Myna) — анонс и обзор](https://ubuntu.com/blog)** (раздел блога Ubuntu/Canonical): что такое Myna, как установить (PPA `canonical-desktop-team/myna`) и настроить (`myna-config`). Поиск по «Myna speech-to-text».
- **[Myna на GitHub](https://github.com/canonical/myna)**: репозиторий, release-страницы, README snap-пакета. Настройка языка: `myna.config set language <short-code>` (русский поддерживается). Ввод через IBus.
- **Локальный манифест snap**: `/snap/myna/current/meta/snap.yaml` — прямо говорит, что «the transcript is typed into the focused application via IBus». Главный источник правды о том, как текст попадает в поле.
- **Справка `myna-config`**: `man myna-config` — настройка/онбординг, привязка шортката (~/.config/ibus/bus).

**Суть для нашего расширения**: Myna — это сервис (не приложение), текст вставляется в **сфокуксированное поле** через input-method мост (IBus). Окно расширения обязано быть видимым для IBus: редактируемым `Clutter.Text` без SECRET-хинтов, с фокусом через `global.stage.set_key_focus` после `show()`.

## 2. GNOME Shell и расширения

- **[GNOME Shell Extensions (официальная wiki)](https://wiki.gnome.org/Projects/GnomeShell/Extensions)**: верхнеуровневое описание, как устроены расширения. Частично устаревает — сверяться с gjs.guide ниже.
- **[gjs.guide — About GNOME Shell](https://gjs.guide/guides/gnome-shell/)**: актуальное введение в устройство Shell (компоненты, Main, панель, uiGroup) и написание расширений.
- **[gjs.guide — Creating an extension](https://gjs.guide/extensions/development/creating.html)**: создание расширения, класс `Extension`, `enable()/disable()`, ESM-модули.
- **[gjs.guide — Anatomy of an extension](https://gjs.guide/extensions/overview/anatomy.html)**: структура расширения (metadata.json, extension.js, stylesheet.css, предпочтения).
- **[gjs.guide — Debugging extensions](https://gjs.guide/extensions/development/debugging.html)**: отладка, devkit-сессия, журналы.

**Наш практический вывод по devkit** (проверен в проекте): логи ошибок расширения попадают **только** в devkit-сессию (`./run-gnome-shell-devkit.sh` → `.tmp/devkit.log`); в журнале основной сессии их нет. Подробнее — в [qa/PROCESS.md](qa/PROCESS.md).

## 3. Справочники API

- **[gjs-docs.gnome.org](https://gjs-docs.gnome.org/)**: браузер API для GJS/GLib — неймспейсы `Clutter`, `St`, `Shell`, `GObject` и т.д. Справа внизу переключатель версий. Главный справочник по конкретным классам.
- **[gjs.guide — GJS Developer Guide](https://gjs.guide/)**: разделы про GJS как таковой (не только Shell): GObject, сигналы, свойства.
- **[Исходники GNOME Shell (gitlab.gnome.org)](https://gitlab.gnome.org/GNOME/gnome-shell)**: ветка `gnome-50`, файлы `js/ui/main.js`, `panelMenu.js`, `layout.js` — готовые паттерны, которые мы используем.
- **[Исходники mutter (gitlab.gnome.org)](https://gitlab.gnome.org/GNOME/mutter)**: ветка `gnome-50`, `clutter/` — реализация `Clutter.Text` (в т.ч. почему Enter в multi-line вставляет перевод строки), `src/st/` — `St.Entry`.
- **Локальные GIR-типелибы** (машина): `/usr/lib/x86_64-linux-gnu/mutter-18/Clutter-18.typelib`, `/usr/lib/gnome-shell/St-18.typelib`. Для интроспекции в gjs: `GI_TYPELIB_PATH=/usr/lib/x86_64-linux-gnu/mutter-18 LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/mutter-18 gjs -c '...'`.

## 4. Элементы интерфейса GNOME Shell, реализуемые в расширениях

Раздел для практического знакомства: как выглядят и ведут себя различные элементы интерфейса, которые можно строить в расширении.

- **Модальные окна и затемнение**: `Main.pushModal` / `Main.popModal` (модальная навигация), `Main.uiGroup` (куда добавляются окна расширений), добавление затемнения **ниже панели**, чтобы панель оставалась кликабельной. См. `js/ui/main.js` и `layout.js` в исходниках Shell.
- **Панель и статусные индикаторы**: `Main.panel.addToStatusArea()`, класс `PanelMenu.Button`, иконки `St.Icon` с symbolic-именами (например, `edit-paste-symbolic`). Паттерн — в `js/ui/panelMenu.js`.
- **Ввод текста**: `Clutter.Text` (многострочность, автоперенос через `line_wrap`/`Pango.WrapMode`, фокус) и `St.Entry` (однострочная обёртка). Наш выбор — `Clutter.Text`.
- **Буфер обмена**: `St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text)`.
- **Уведомления**: `Main.notify(title, text)` — системные уведомления GNOME (в т.ч. «Текст скопирован», «Нечего копировать»).
- **Обработка клавиш**: `key-press-event` на акторе, `Clutter.ModifierType.CONTROL_MASK` (Ctrl+Enter), `Clutter.KEY_Escape` (Esc); ключевой принцип — перехватывать только нужную комбинацию, остальное пропускать (`Clutter.EVENT_PROPAGATE`).
- **Кнопки и компоновка**: `St.Button`, `St.BoxLayout` (горизонтальные/вертикальные ряды), позиционирование по монитору (`Layout.MonitorConstraint`).

**Практический ориентир**: реальный код этих паттернов — в `extension.js` нашего проекта и в исходниках Shell (`js/ui/`).