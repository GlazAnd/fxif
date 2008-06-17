/*
 *  FxIF options window handling.
 *
 *  Christian Eyrich <ch.ey@gmx.net>
 */

function onLoadPrefs()
{
  var mapProviderEl = document.getElementById("mapProvider");
  var gpsFormatEl = document.getElementById("gpsFormat");

  try {
    gpsFormatEl.value = getPreferences().getIntPref("gpsFormat");
  } catch(e) {
    gpsFormatEl.selected = 0;
  }

  try {
    mapProviderEl.value = getPreferences().getCharPref("mapProvider");
  } catch(e) {
    mapProviderEl.value = "";
  }
}

function onSave()
{
  var mapProviderEl = document.getElementById("mapProvider");
  var gpsFormatEl = document.getElementById("gpsFormat");

  getPreferences().setIntPref("gpsFormat", gpsFormatEl.value);
  getPreferences().setCharPref("mapProvider", mapProviderEl.value);

  return true;
}
