/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import GLib from 'gi://GLib';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';

/**
 * Voice Input Helper — расширение GNOME Shell для быстрого голосового ввода
 * через Myna (Ubuntu Speech-to-Text). Надиктованный текст попадает в буфер
 * обмена; минимум действий между «хочу сказать» и «текст вставлен».
 *
 * Требования v1 — см. REQUIREMENTS.md (US-1..US-7).
 */
export default class VoiceInputHelperExtension extends Extension {
    enable() {
        // Кнопка в статус-зоне без выпадающего меню: dontCreateMenu=true
        // отключает встроенный клик-жест и создаёт PopupDummyMenu.
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, true);

        // Кастомная иконка из каталога icons/ расширения: встроенный набор Shell
        // (gnome-shell-icons.gresource) не содержит подходящей панельной иконки
        // для голосового ввода.
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${this.path}/icons/voice-input-helper-icon-symbolic.svg`),
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(this._icon);

        // Клик по значку сразу открывает окно ввода (US-1). Прямой сигнал
        // button-press-event надёжнее жестов; возвращаем EVENT_STOP, чтобы
        // событие не ушло дальше.
        this._indicator.connect('button-press-event', () => {
            this._openModal();
            return Clutter.EVENT_STOP;
        });

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._settings = this.getSettings();
    }

    disable() {
        if (this._modal) {
            this._modal.destroy();
            this._modal = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
    }

    _openModal() {
        // Singleton: окно создаётся один раз и переиспользуется — между
        // открытиями текст в поле сохраняется (US-5), повторный клик
        // просто возвращает фокус (US-1).
        if (!this._modal)
            this._modal = new VoiceInputModal(this._settings);
        this._modal.open();
    }
}

// Минимальная высота поля ввода, в строках (US-7).
const MIN_LINES = 4;

// Сколько после закрытия окна сброс фокуса считается побочным эффектом
// этого закрытия (а не действием пользователя), мкс. См. _onKeyFocusChanged.
const FOCUS_RESTORE_WINDOW_US = 300 * 1000;

/**
 * Модальное окно ввода: затемняющая подложка под панелью и центрированный
 * по монитору диалог с многострочным полем ввода (St.Entry) и кнопками.
 * Оформление — от системной темы модальных диалогов Shell (US-7).
 *
 * Затемнение покрывает область под панелью (workArea); клик по подложке
 * закрывает окно (US-4), клик по панели — нет (панель доступна, US-1).
 *
 * Без pushModal: окно показывается поверх (Main.uiGroup), панель остаётся
 * кликабельной; фокус предыдущего актора сохраняется и возвращается вручную
 * (вместо popModal).
 */
const VoiceInputModal = GObject.registerClass(
class VoiceInputModal extends St.Widget {
    _init(settings) {
        // Контейнер по размеру экрана: всё, что вне диалога, — тёмный фон.
        // НЕ reactive: иначе перехватывал бы все клики (включая панель) —
        // панель (US-1) и клик по фону работают через подложку/диалог ниже.
        super._init({
            style_class: 'voice-input-modal-container',
            layout_manager: new Clutter.BinLayout(),
        });

        this._prevFocus = null;

        // Контейнер растягивается на монитор (MonitorConstraint задаёт размер).
        this._monitorConstraint = new Layout.MonitorConstraint();
        this._monitorConstraint.index = global.display.get_current_monitor();
        this.add_constraint(this._monitorConstraint);

        // Тёмная подложка. Покрывает область под панелью (workArea = монитор
        // минус панель/чанж), реактивна — клик по ней закрывает окно (US-4).
        // Панель остаётся доступной (US-1): подложка её не перекрывает.
        this._bg = new St.Widget({
            style_class: 'voice-input-modal-bg',
            reactive: true,
        });
        const bgMon = new Layout.MonitorConstraint({workArea: true});
        bgMon.index = global.display.get_current_monitor();
        this._bg.add_constraint(bgMon);
        this._bg.connect('button-press-event', () => this._close());
        this.add_child(this._bg);

        // Диалог: центрируется BinLayout-контейнером (natural size от
        // содержимого), без растягивания на весь экран. Класс modal-dialog —
        // фон, цвет текста и отступы системных диалогов темы (US-7).
        this._dialog = new St.Widget({
            style_class: 'modal-dialog voice-input-modal-dialog',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            can_focus: true,
        });
        // ВРЕМЕННО: A/B-сравнение оформления диалога (см. stylesheet.css):
        // настройка custom-dialog-style, переключается на лету из prefs.
        this._settings = settings;
        this._settingsId = settings.connect('changed::custom-dialog-style',
            () => this._updateDialogStyle());
        this._updateDialogStyle();
        this._dialog.connect('key-press-event', (self, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape)
                return this._close();
            return Clutter.EVENT_PROPAGATE;
        });
        this.add_child(this._dialog);

        // Внутренний бокс диалога (заголовок, поле, кнопки).
        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'voice-input-modal-box',
            reactive: true,
            can_focus: true,
        });
        this._dialog.add_child(this._box);

        this._titleLabel = new St.Label({
            style_class: 'voice-input-modal-title',
            text: _('Voice Input Helper'),
        });
        this._box.add_child(this._titleLabel);

        // Поле ввода — St.Entry с многострочным Clutter.Text внутри (US-2).
        // St.Entry — St-виджет: цвета текста, выделения, курсора и подсказки
        // берёт из темы Shell и обновляет их при смене темы (US-7). Сам
        // Clutter.Text CSS не понимает, поэтому нужна именно эта обёртка.
        this._entry = new St.Entry({
            style_class: 'voice-input-text',
            hint_text: _('Говорите или печатайте…'),
            x_expand: true,
        });

        // editable + single_line_mode:false + line_wrap:WORD_CHAR дают
        // многострочность с автопереносом. activatable:false — St.Entry
        // создаёт поле «активируемым», и Enter уходил бы в activate вместо
        // перевода строки.
        this._text = this._entry.clutter_text;
        this._text.set({
            editable: true,
            selectable: true,
            single_line_mode: false,
            activatable: false,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
            cursor_visible: true,
            reactive: true,
        });

        this._text.connect('key-press-event', (self, event) => {
            const symbol = event.get_key_symbol();
            if (symbol !== Clutter.KEY_Return && symbol !== Clutter.KEY_KP_Enter &&
                symbol !== Clutter.KEY_ISO_Enter)
                return Clutter.EVENT_PROPAGATE;

            // Ctrl+Enter — копировать и закрыть (US-2/US-3).
            if (event.get_state() & Clutter.ModifierType.CONTROL_MASK) {
                this._copy();
                return Clutter.EVENT_STOP;
            }

            // Enter и Shift+Enter — перевод строки (US-2), явно: не зависим
            // от того, как St.Entry/Clutter.Text обрабатывают Enter сами.
            this._text.delete_selection();
            this._text.insert_unichar('\n');
            return Clutter.EVENT_STOP;
        });
        this._box.add_child(this._entry);

        // Минимальная высота поля — несколько строк (US-7). Считается от
        // шрифта темы, поэтому следует системному масштабу шрифта; пересчёт
        // при каждой смене стиля (смена темы, масштаба).
        this._entry.connect('style-changed', () => this._updateMinHeight());

        // QA-хук прототипа: длинный текст при первом открытии (автоперенос).
        // Активируется переменной VHI_QA_TEXT=1 при запуске devkit. Удалить в финале.
        this._qaTextApplied = false;

        // Ряд кнопок — как в системных диалогах Shell (ui/dialog.js): те же
        // классы и раскладка, кнопки равной ширины на всю ширину диалога.
        this._buttonBox = new St.Widget({
            style_class: 'modal-dialog-button-box',
            layout_manager: new Clutter.BoxLayout({
                spacing: 12,
                homogeneous: true,
            }),
        });
        this._box.add_child(this._buttonBox);

        this._buttonBox.add_child(this._makeButton(_('Копировать'), () => this._copy()));
        this._buttonBox.add_child(this._makeButton(_('Очистить'), () => this._clear()));
        this._buttonBox.add_child(this._makeButton(_('Закрыть'), () => this._close()));

        // Защита фокуса при диктовке (US-2). Myna на конце фразы закрывает
        // своё окно-индикатор; на закрытие любого окна DING (иконки рабочего
        // стола) активирует верхнее окно приложения — фокус уходит из поля.
        // Запоминаем момент закрытия окна, пока фокус в поле, и если сразу
        // за ним фокус сбросился — возвращаем его (см. _onKeyFocusChanged).
        this._windowClosedAt = 0;
        this._restoreFocusId = 0;
        this._wmDestroyId = global.window_manager.connect('destroy', () => {
            if (this.visible && global.stage.get_key_focus() === this._text)
                this._windowClosedAt = GLib.get_monotonic_time();
        });
        this._keyFocusId = global.stage.connect('notify::key-focus',
            () => this._onKeyFocusChanged());

        // ВРЕМЕННО: диагностика фокуса при диктовке Myna — удалить до коммита.
        // Метка времени в мс — журнал даёт только секунды, а события идут
        // пачкой; DBG-строки фокуса окон — чтобы понять, кто забирает фокус.
        const dbg = msg => {
            if (this.visible)
                console.log(`[voice-input-helper] DBG ${GLib.get_monotonic_time() / 1000 | 0} ${msg}`);
        };
        const win = w => w
            ? `"${w.get_title()}" class=${w.get_wm_class()} type=${w.get_window_type()}`
            : 'null';
        this._dbgFocusId = global.stage.connect('notify::key-focus', () => {
            const focus = global.stage.get_key_focus();
            dbg(`key-focus → ${focus}; focus-window=${win(global.display.focus_window)}`);
            if (!focus) {
                const stack = new Error().stack.split('\n').slice(1, 6).join(' | ');
                dbg(`key-focus null, JS-стек: ${stack || '(нет — вызов не из JS)'}`);
            }
        });
        this._dbgSignals = [
            [global.display, global.display.connect('notify::focus-window',
                () => dbg(`focus-window → ${win(global.display.focus_window)}`))],
            [global.display, global.display.connect('window-created',
                (d, w) => dbg(`window-created ${win(w)}`))],
            [global.window_manager, global.window_manager.connect('map',
                (wm, a) => dbg(`map ${win(a.get_meta_window())}`))],
            [global.window_manager, global.window_manager.connect('destroy',
                (wm, a) => dbg(`destroy ${win(a.get_meta_window())}`))],
        ];
        this._entry.hint_actor?.connect('notify::allocation', hint => {
            const [, y] = hint.get_position();
            dbg(`hint y=${y} h=${hint.height}, entry h=${this._entry.height}`);
        });
        this._text.connect('insert-text', (self, text) => {
            const focus = global.stage.get_key_focus();
            dbg(`insert ${JSON.stringify(text)}, focus=${focus === this._text ? 'field' : focus}`);
        });

        // Добавляемся на стадию один раз; показ/скрытие — через open()/close().
        Main.uiGroup.add_child(this);
        this.hide();
    }

    _makeButton(text, callback) {
        const btn = new St.Button({
            style_class: 'modal-dialog-button',
            label: text,
            can_focus: true,
            x_expand: true,
        });
        btn.connect('clicked', callback);
        return btn;
    }

    _copy() {
        const text = this._text.text;
        if (!text || text.trim() === '') {
            Main.notify('Voice Input Helper', _('Нечего копировать'), {clear: true});
            return;
        }
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
        Main.notify('Voice Input Helper', _('Текст скопирован в буфер обмена'));
        this._close();
    }

    _clear() {
        this._text.text = '';
        this._ensureFocus();
    }

    open() {
        if (this.visible) {
            // Уже открыто: просто возвращаем фокус (без grab-перехвата).
            this._ensureFocus();
            return;
        }

        // Без pushModal: вместо актор-граба (который «глушил» панель) просто
        // показываем окно поверх (Main.uiGroup) и сами сохраняем фокус.
        // Панель остаётся кликабельной (US-1), клик по фону закрывает (US-4).
        this._prevFocus = global.stage.get_key_focus();
        this.show();

        // Фокус в поле ТОЛЬКО после show() — актор уже смонтирован (mapped);
        // иначе IBus-мост у Myna получит «commit REFUSED: focus lost».
        this._ensureFocus();

        // QA-хук прототипа: вставить длинный текст при включённом VHI_QA_TEXT.
        // Удалить в финале.
        if (!this._qaTextApplied && GLib.getenv('VHI_QA_TEXT') === '1') {
            this._qaTextApplied = true;
            this._text.text =
                'Это длинный текст для проверки автопереноса строк в многострочном ' +
                'поле ввода расширения Voice Input Helper. Он специально занимает ' +
                'несколько строк, чтобы убедиться, что перенос по словам работает ' +
                'корректно, курсор видим, а само окно не раздувается при росте ' +
                'текста. Проверяем и то, что весь текст целиком попадает в буфер ' +
                'обмена при копировании, вместе с переводами строк.';
        }
    }

    _updateDialogStyle() {
        if (this._settings.get_boolean('custom-dialog-style'))
            this._dialog.add_style_class_name('voice-input-modal-dialog-custom');
        else
            this._dialog.remove_style_class_name('voice-input-modal-dialog-custom');
    }

    _updateMinHeight() {
        // Высота строки — из метрик шрифта темы в контексте самого поля.
        const font = this._entry.get_theme_node().get_font();
        const metrics = this._text.get_pango_context().get_metrics(font, null);
        const lineHeight = (metrics.get_ascent() + metrics.get_descent()) / Pango.SCALE;
        this._text.min_height = Math.ceil(lineHeight * MIN_LINES);

        // St.Entry центрирует подсказку по вертикали внутри поля по её
        // natural-высоте; высота подсказки = высоте поля — и она стоит
        // вверху, как курсор (height задаёт и min-, и natural-высоту).
        if (this._entry.hint_actor)
            this._entry.hint_actor.height = this._text.min_height;
    }

    _onKeyFocusChanged() {
        if (!this.visible || global.stage.get_key_focus() !== null)
            return;
        // Сброс фокуса не сразу после закрытия окна — это действие
        // пользователя (клик по другому окну и т.п.), не вмешиваемся (US-4).
        if (GLib.get_monotonic_time() - this._windowClosedAt > FOCUS_RESTORE_WINDOW_US)
            return;
        this._windowClosedAt = 0;
        // Возвращаем фокус после того, как активация окна завершится.
        if (!this._restoreFocusId) {
            this._restoreFocusId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._restoreFocusId = 0;
                if (this.visible) {
                    console.log('[voice-input-helper] DBG фокус возвращён в поле'); // ВРЕМЕННО
                    this._ensureFocus();
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _ensureFocus() {
        global.stage.set_key_focus(this._text);
    }

    _close() {
        // Фокус возвращаем ранее активному актору (что делал popModal).
        if (this._prevFocus)
            global.stage.set_key_focus(this._prevFocus);
        this._prevFocus = null;
        this.hide();
    }

    destroy() {
        // Никакого grab — ничего снимать не нужно.
        global.window_manager.disconnect(this._wmDestroyId);
        global.stage.disconnect(this._keyFocusId);
        if (this._restoreFocusId)
            GLib.source_remove(this._restoreFocusId);
        global.stage.disconnect(this._dbgFocusId); // ВРЕМЕННО: диагностика
        this._dbgSignals.forEach(([obj, id]) => obj.disconnect(id)); // ВРЕМЕННО
        this._settings.disconnect(this._settingsId);
        this._prevFocus = null;
        super.destroy();
    }
});