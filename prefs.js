/* prefs.js
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

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * Окно настроек Voice Input Helper. Каждая настройка — ключ GSettings
 * (схема в schemas/), привязанный к виджету через settings.bind: значение
 * пишется сразу при изменении, а расширение подхватывает его на лету
 * (сигнал changed::<ключ>), без перезапуска.
 */
export default class VoiceInputHelperPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Держим ссылку на настройки, пока открыто окно: иначе объект
        // соберёт GC и привязки перестанут работать.
        window._settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('Оформление'),
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(page);

        // Временная группа: A/B-сравнение оформления диалога (QA v0.2).
        const group = new Adw.PreferencesGroup({
            title: _('Окно ввода'),
            description: _('Временная настройка для сравнения вариантов оформления.'),
        });
        page.add(group);

        const customStyle = new Adw.SwitchRow({
            title: _('Собственное скругление и тень'),
            subtitle: _('Выключено — системные из темы оформления'),
        });
        group.add(customStyle);
        window._settings.bind('custom-dialog-style', customStyle, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }
}
