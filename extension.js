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

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';

/**
 * Voice Input Helper — расширение GNOME Shell для быстрого голосового ввода
 * через Myna (Ubuntu Speech-to-Text). Надиктованный текст попадает в буфер
 * обмена; минимум действий между «хочу сказать» и «текст вставлен».
 *
 * Требования v1 — см. REQUIREMENTS.md (US-1..US-6).
 */
export default class VoiceInputHelperExtension extends Extension {
    enable() {
        // Кнопка в статус-зоне без выпадающего меню: dontCreateMenu=true
        // отключает встроенный клик-жест и создаёт PopupDummyMenu.
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, true);

        this._icon = new St.Icon({
            icon_name: 'edit-paste-symbolic',
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
    }

    _openModal() {
        // Singleton: окно создаётся один раз и переиспользуется — между
        // открытиями текст в поле сохраняется (US-5), повторный клик
        // просто возвращает фокус (US-1).
        if (!this._modal)
            this._modal = new VoiceInputModal();
        this._modal.open();
    }
}

/**
 * Модальное окно ввода: затемняющая подложка под панелью и центрированный
 * по монитору диалог с многострочным полем ввода (Clutter.Text) и кнопками.
 *
 * Затемнение НЕ перекрывает верхнюю панель (US-1: панель доступна), поэтому
 * подложка сдвинута вниз на высоту панели; клик по подложке закрывает окно
 * (US-4), клик по панели — нет.
 *
 * Модальность через Main.pushModal(actor, {actionMode}) — grab снимается
 * автоматически при destroy актора; Main.popModal(grab) сам возвращает фокус
 * ранее активному окну (US-3).
 */
const VoiceInputModal = GObject.registerClass(
class VoiceInputModal extends St.Widget {
    _init() {
        // Контейнер по размеру экрана: всё, что вне диалога, — тёмный фон.
        super._init({
            style_class: 'voice-input-modal-container',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._grab = null;

        // Контейнер растягивается на монитор (MonitorConstraint задаёт размер).
        this._monitorConstraint = new Layout.MonitorConstraint();
        this._monitorConstraint.index = global.display.get_current_monitor();
        this.add_constraint(this._monitorConstraint);

        // Тёмная подложка. Чтобы панель осталась доступной (US-1), её нижняя
        // граница сдвинута на высоту панели; клик по ней закрывает окно (US-4).
        this._bg = new St.Widget({
            style_class: 'voice-input-modal-bg',
            reactive: true,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
        });
        this._bg.add_constraint(new Clutter.BindConstraint({
            source: Main.panel,
            coordinate: Clutter.BindCoordinate.Y,
            offset: Main.panel.height,
        }));
        this._bg.connect('button-press-event', () => this._close());
        this.add_child(this._bg);

        // Диалог: центрируется BinLayout-контейнером (natural size от
        // содержимого), без растягивания на весь экран.
        this._dialog = new St.Widget({
            style_class: 'voice-input-modal-dialog',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            can_focus: true,
        });
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

        // Поле ввода — многострочное Clutter.Text (US-2):
        // editable + single_line_mode:false + line_wrap:WORD_CHAR дают
        // автоперенос и перевод строки по Enter. Это «настоящее поле» для
        // Myna: фокус через global.stage.set_key_focus ПОСЛЕ show() — иначе
        // IBus-мост получит «commit REFUSED: focus lost».
        this._text = new Clutter.Text({
            editable: true,
            selectable: true,
            single_line_mode: false,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
            cursor_visible: true,
            reactive: true,
            x_expand: true,
        });
        this._text.connect('key-press-event', (self, event) => {
            const symbol = event.get_key_symbol();
            const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;
            // Ctrl+Enter — копировать и закрыть (US-2/US-3);
            // голый Enter уходит в поле (перевод строки в multi-line).
            if (ctrl && (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter))
                return this._copy(), Clutter.EVENT_STOP;
            return Clutter.EVENT_PROPAGATE;
        });
        this._box.add_child(this._text);

        // Диагностика прототипа: логируем координаты курсора при изменении
        // (для будущего автоскролла); в проде убрать.
        this._text.connect('cursor-changed', () => {
            if (this._text.cursor_visible) {
                const [ok, x, y, h] = this._text.position_to_coords(this._text.cursor_position);
                if (ok)
                    log(`voice-input-helper: cursor pos=${this._text.cursor_position} x=${x} y=${y} h=${h}`);
            }
        });

        // QA-хук прототипа: длинный текст при первом открытии (автоперенос).
        // Активируется переменной VHI_QA_TEXT=1 при запуске devkit. Удалить в финале.
        this._qaTextApplied = false;

        this._buttonBox = new St.BoxLayout({
            style_class: 'voice-input-modal-buttons',
            x_align: Clutter.ActorAlign.END,
        });
        this._box.add_child(this._buttonBox);

        this._buttonBox.add_child(this._makeButton(_('Копировать'), () => this._copy()));
        this._buttonBox.add_child(this._makeButton(_('Очистить'), () => this._clear()));
        this._buttonBox.add_child(this._makeButton(_('Закрыть'), () => this._close()));

        // Добавляемся на стадию один раз; показ/скрытие — через open()/close().
        Main.uiGroup.add_child(this);
        this.hide();
    }

    _makeButton(text, callback) {
        const btn = new St.Button({
            style_class: 'button',
            label: text,
            can_focus: true,
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
            // Уже открыто: не берём новый grab, просто возвращаем фокус.
            this._ensureFocus();
            return;
        }

        this.show();
        this._grab = Main.pushModal(this, {
            actionMode: Shell.ActionMode.NORMAL,
        });

        // Фокус в поле ТОЛЬКО после show() — актор уже смонтирован (mapped).
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

    _ensureFocus() {
        global.stage.set_key_focus(this._text);
    }

    _close() {
        if (this._grab) {
            try {
                Main.popModal(this._grab);
            } catch (err) {
                console.warn(`voice-input-helper: popModal: ${err}`);
            }
            this._grab = null;
        }
        this.hide();
    }

    destroy() {
        // Grab снимается автоматически при разрушении актора;
        // popModal вручную не вызываем во избежание "incorrect pop".
        this._grab = null;
        super.destroy();
    }
});