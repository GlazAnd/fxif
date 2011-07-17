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
 * Ted Mielczarek <luser_mozilla@perilith.com>.
 * Portions created by the Initial Developer are Copyright (C) 2005
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Christian Eyrich <ch.ey@gmx.net>
 * ***** END LICENSE BLOCK ***** */

"use strict";

/*
 *  Some utility functions for FxIF.
 */

function fxifUtilsClass ()
{
  var prefInstance = null;

  this.exifDone = false;
  this.iptcDone = false;
  this.xmpDone = false;


  this.read16 = function (data, offset, swapbytes)
  {
    if(!swapbytes)
      return (data[offset] << 8) | data[offset+1];

    return data[offset] | (data[offset+1] << 8);
  }

  this.read32 = function (data, offset, swapbytes)
  {
    if(!swapbytes)
      return (data[offset] << 24) | (data[offset+1] << 16) | (data[offset+2] << 8) | data[offset+3];

    return data[offset] | (data[offset+1] << 8) | (data[offset+2] << 16) | (data[offset+3] << 24);
  }

  this.bytesToString = function (data, offset, num)
  {
    var s = "";

    for(var i=offset; i<offset+num; i++) {
      if(data[i] == 0)
        continue;

      s += String.fromCharCode(data[i]);
    }

    return s;
  }


  this.dd2dms = function (gpsval)
  {
    // a bit unconventional calculation to get input edge cases
    // like 0x31 / 0x01, 0x0a / 0x01, 0x3c / 0x01 to 49°11'0" instead of 49°10'60"
    var gpsDeg = Math.floor(gpsval / 3600);
    gpsval -= gpsDeg * 3600.0;
    var gpsMin = Math.floor(gpsval / 60);
    // round to 2 digits after the comma
    var gpsSec = (gpsval - gpsMin * 60.0).toFixed(2);
    return new Array(gpsDeg, gpsMin, gpsSec);
  }

  this.dd2dm = function (gpsval)
  {
    // a bit unconventional calculation to get input edge cases
    // like 0x31 / 0x01, 0x0a / 0x01, 0x3c / 0x01 to 49°11'0" instead of 49°10'60"
    var gpsDeg = Math.floor(gpsval / 3600);
    gpsval -= gpsDeg * 3600.0;
    // round to 2 digits after the comma
    var gpsMin = (gpsval / 60).toFixed(2);
    return new Array(gpsDeg, gpsMin);
  }

  this.dd2dd = function (gpsval)
  {
    // round to 6 digits after the comma
    var gpsArr = new Array();
    gpsArr.push((gpsval / 3600).toFixed(6));
    return gpsArr;
  }

  this.getPreferences = function ()
  {
    if (!prefInstance) {
      try {
        var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
        prefInstance = prefService.getBranch("extensions.fxif."); // preferences extensions.fxif node
      } catch (e) {}
    }

    return prefInstance;
  }


  // Retrieves the language which is likely to be the users favourite one.
  // Currently we end up using only the first language code.
  this.getLang = function ()
  {
    var lang;

    // See if we can get a user provided preferred language.
    try {
      var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
      lang = prefService.getBranch("intl.").getComplexValue("accept_languages", Components.interfaces.nsIPrefLocalizedString).data;
    } catch (e) {}
    if(!lang || !lang.length)  // maybe the pref was empty
    {
      // Get the browsers language as default, only use the primary part of the string.
      // That's a bit laborious since defLang must be a string, no array.
      var nl = navigator.language.match(/^[a-z]{2,3}/i);
      lang = nl.length ? nl[0] : "en";
    }
    // To really get a clean code.
    lang = lang.match(/[a-z]{2,3}/i)[0];

    return lang;
  }
}
