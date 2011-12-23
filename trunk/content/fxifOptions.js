/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is FxIF.
 *
 * The Initial Developer of the Original Code is
 * Christian Eyrich <ch.ey@gmx.net>.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

/*
 *  FxIF options window handling.
 */

function fxifOptionsClass ()
{
  var fxifUtils = new fxifUtilsClass();

  this.onLoadPrefs = function ()
  {
    var mapProviderEl = document.getElementById("mapProvider");
    var gpsFormatEl = document.getElementById("gpsFormat");

    try {
      gpsFormatEl.value = fxifUtils.getPreferences().getIntPref("gpsFormat");
    } catch(e) {
      gpsFormatEl.selected = 0;
    }

    try {
      mapProviderEl.value = fxifUtils.getPreferences().getCharPref("mapProvider");
    } catch(e) {
      mapProviderEl.value = "http://www.openstreetmap.org/?mlat=%lat%&mlon=%lon%&layers=M";
    }
  }

  this.onSave = function ()
  {
    var mapProviderEl = document.getElementById("mapProvider");
    var gpsFormatEl = document.getElementById("gpsFormat");

    fxifUtils.getPreferences().setIntPref("gpsFormat", gpsFormatEl.value);
    fxifUtils.getPreferences().setCharPref("mapProvider", mapProviderEl.value);

    return true;
  }
}

var fxifOptions = new fxifOptionsClass();