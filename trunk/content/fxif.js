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

/*
 *  Main code driving FxIF.
 */

//"use strict";

function fxifClass()
{
  const SOI_MARKER = 0xFFD8;  // start of image
  const SOS_MARKER = 0xFFDA;  // start of stream
  const EOI_MARKER = 0xFFD9;  // end of image
  const APP1_MARKER = 0xFFE1; // start of binary EXIF data
  const APP13_MARKER = 0xFFED; // start of IPTC-NAA data
  const COM_MARKER = 0xFFFE; // start of JFIF comment data

  const INTEL_BYTE_ORDER = 0x4949;


  var fxifUtils = new fxifUtilsClass();
  var metadataUtils = new metadataUtilsClass();

  var stringBundle;
  var imgURL = null;

  var originalLoad = window.onLoad;


  function getDataStream(imgUrl)
  {
    var istream = null;
/*
    disabling this for now since it delivers compressed content
    if the server sends it compressed
    try {
      var cs = Components.classes["@mozilla.org/network/cache-service;1"].getService(Components.interfaces.nsICacheService);
      var httpCacheSession = cs.createSession("HTTP", 0, true);
      // also return expired cache entries, to work around poorly written sites
      httpCacheSession.doomEntriesIfExpired = false;
      var nsICache = Components.interfaces.nsICache;
      // use false so we don't block!
      var cdesc = httpCacheSession.openCacheEntry(imgUrl, nsICache.ACCESS_READ, false);
      istream = cdesc.openInputStream(0);
    }
    catch(ex) {}
*/
    try {
      if(!istream) {
        var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
        var u = ios.newURI(imgUrl, null, null);
        // if it's a web resource, load it with bypassing the cache
        if(u.schemeIs("http") ||
           u.schemeIs("https")) {
            var c = ios.newChannelFromURI(u);
//            c.loadFlags |= Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE;
            istream = c.open();
        }
        else
        // see if it's a local file and we can open it
        if(u.schemeIs("file")) {
          var fileHandler = ios.getProtocolHandler("file").QueryInterface(Components.interfaces.nsIFileProtocolHandler);
          var f = fileHandler.getFileFromURLSpec(imgUrl);
          istream = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
          istream.init(f, 1, 0, false);
        }
        else
        // or is it some sort of message
        if(u.schemeIs("mailbox") ||
           u.schemeIs("news") ||
           u.schemeIs("imap")) {
          // get a channel
          var c = ios.newChannelFromURI(u);
          // and buffered open it into a stream
          // not that great in terms of responsiveness,
          // but ways easier than asyncOpen().
          istream = c.open();
        }
        else {
          // no input stream and not a local file. oh well.
          // might be in the process of loading or just not
          // cached.
          return null;
        }
      }
    }
    catch(ex) {}

    return istream;
  }

  function gatherData(imgUrl)
  {
    var dataObj = {};

    var istream = getDataStream(imgUrl);
    if (istream) {
      try {
        var bis = Components.classes["@mozilla.org/binaryinputstream;1"].createInstance(Components.interfaces.nsIBinaryInputStream);
        bis.setInputStream(istream);
        var swapbytes = false;
        var marker = bis.read16();
        var len;
        if (marker == SOI_MARKER) {
          marker = bis.read16();
          // reading SOS marker indicates start of image stream
          while (marker != SOS_MARKER &&
                 (!fxifUtils.exifDone || !fxifUtils.iptcDone || !fxifUtils.xmpDone)) {
            // length includes the length bytes
            len = bis.read16() - 2;

            if (marker == APP1_MARKER && len >= 6) {
              // for EXIF the first 6 bytes should be 'Exif\0\0'
              var header = bis.readBytes(6);
              // Is it EXIF?
              if (header == 'Exif\0\0') {
                // 8 byte TIFF header
                // first two determine byte order
                var exifData = bis.readByteArray(len - 6);

                swapbytes = fxifUtils.read16(exifData, 0, false) == INTEL_BYTE_ORDER;

                // next two bytes are always 0x002A
                // offset to Image File Directory (includes the previous 8 bytes)
                var ifd_ofs = fxifUtils.read32(exifData, 4, swapbytes);
                var exifReader = new exifClass(stringBundle);
                try {
                  exifReader.readExifDir(dataObj, exifData, ifd_ofs, swapbytes);
                }
                catch(ex) {
                  pushError(dataObj, "EXIF");
                }
                fxifUtils.exifDone = true;
              }
              else {
                if (len > 28)
                {
                  // Maybe it's XMP. If it is, it starts with the XMP namespace URI
                  // 'http://ns.adobe.com/xap/1.0/\0'.
                  // see http://partners.adobe.com/public/developer/en/xmp/sdk/XMPspecification.pdf
                  header += bis.readBytes(22);  // 6 bytes read means 22 more to go
                  if (header == 'http://ns.adobe.com/xap/1.0/') {
                    // There is at least one programm which writes spaces behind the namespace URI.
                    // Overread up to 5 bytes of such garbage until a '\0'. I deliberately don't read
                    // until reaching len bytes.
                    var a; var j = 0;
                    do
                    {
                      a = bis.readBytes(1);
                    } while(++j < 5 && a == ' ');
                    if (a == '\0') {
                      var xmpData = bis.readByteArray(len - (28 + j));
                      try {
                        var xmpReader = new xmpClass(stringBundle);
                        xmpReader.parseXML(dataObj, xmpData);
                      }
                      catch(ex) {
                        pushError(dataObj, "XMP");
                      }
                      fxifUtils.xmpDone = true;
                    }
                    else
                      bis.readBytes(len - (28 + j));
                  }
                  else
                    bis.readBytes(len - 28);
                }
                else
                {
                    bis.readBytes(len - 6);                  
                }
              }
            }
            else
              // Or is it IPTC-NAA record as IIM?
              if (marker == APP13_MARKER && len > 14) {
                // 6 bytes, 'Photoshop 3.0\0'
                var psString = bis.readBytes(14);
                var psData = bis.readByteArray(len - 14);
                if (psString == 'Photoshop 3.0\0') {
                  var iptcReader = new iptcClass();
                  try {
                    iptcReader.readPsSection(dataObj, psData);
                  }
                  catch(ex) {
                    pushError(dataObj, "IPTC");
                  }
                  fxifUtils.iptcDone = true;
                }
              }
              else
                // Or perhaps a JFIF comment?
                if (marker == COM_MARKER && len >= 1) {
                  dataObj.UserComment = fxifUtils.bytesToString(bis.readByteArray(len), 0, len);
                }
                else {
                  // read and discard data ...
                  bis.readBytes(len);
                }

            marker = bis.read16();
          }
        }
        bis.close();
        bis = istream = cdesc = httpCacheSession = null;
      }
      catch(ex) {
        dump(ex + '\n');
        dataObj.error = stringBundle.getString("generalError");
      }
    }

    return dataObj;
  }

  function pushError(dataObj, type)
  {
    if (dataObj.error)
      dataObj.error += '\n';
    else
      dataObj.error = '';
    dataObj.error += stringBundle.getFormattedString("specialError", [type, type]);
  }

  // Returns true if imgUrl is a JPEG image, false otherwise.
  // This isn't bullet proof but solely relies on the first
  // two bytes being SOI_MARER. This should suffice.
  // Since it's merely a hack, I'd rather like asking the app
  // what type of image it is. But how to?
  function isJPEG(imgUrl)
  {
    var istream = getDataStream(imgUrl);
    if(istream) {
        var bis = Components.classes["@mozilla.org/binaryinputstream;1"].createInstance(Components.interfaces.nsIBinaryInputStream);
        bis.setInputStream(istream);
        if(bis.read16() == SOI_MARKER)
          return true;
    }

    return false;
  }


  showEXIFDataFor = function (url)
  {
    var ed = gatherData(url);
    // ed always exists, so we need a way to find out
    // if it's empty or not.
    // This is the best idea I could come up with, any better idea?
    var edEmpty = true;
    for(var tmp in ed) {
      if (tmp != "error")
      {
        edEmpty = false;
        break;
      }
    }

    if(!ed.error)
      document.getElementById("error").style.display = "none";
    else
      document.getElementById("error-label").value = ed.error;

    if(!edEmpty) {
      document.getElementById("no-data").style.display = "none";
      metadataUtils.setInfo("camera-make", ed.Make);
      metadataUtils.setInfo("camera-model", ed.Model);
      metadataUtils.setInfo("camera-lens", ed.Lens);
      metadataUtils.setInfo("image-date", ed.Date);
      metadataUtils.setInfo("image-orientation", ed.Orientation);
      metadataUtils.setInfo("image-bw", ed.IsColor);		// TODO: what's this?
      metadataUtils.setInfo("image-flash", ed.FlashUsed);
      metadataUtils.setInfo("image-focallen", ed.FocalLengthText);
      metadataUtils.setInfo("image-digitalzoom", ed.DigitalZoomRatio);
      metadataUtils.setInfo("image-exposuretime", ed.ExposureTime);
      metadataUtils.setInfo("image-aperture", ed.ApertureFNumber);
      metadataUtils.setInfo("image-focusdist", ed.Distance);
      metadataUtils.setInfo("image-isoequiv", ed.ISOequivalent);
      metadataUtils.setInfo("image-exposurebias", ed.ExposureBias);
      metadataUtils.setInfo("image-whitebalance", ed.WhiteBalance);
      metadataUtils.setInfo("image-lightsource", ed.LightSource);
      metadataUtils.setInfo("image-meteringmode", ed.MeteringMode);
      metadataUtils.setInfo("image-exposureprogram", ed.ExposureProgram);
      metadataUtils.setInfo("image-exposuremode", ed.ExposureMode);
      metadataUtils.setInfo("image-colorspace", ed.ColorSpace);
      metadataUtils.setInfo("image-gpscoord", ed.GPSLat + ", " + ed.GPSLon);
      metadataUtils.setInfo("image-gpsalt", ed.GPSAlt);
      metadataUtils.setInfo("image-gpsimgdir", ed.GPSImgDir);
      metadataUtils.setInfo("image-creator", ed.Creator);
      metadataUtils.setInfo("image-city", ed.City);
      metadataUtils.setInfo("image-sublocation", ed.Sublocation);
      metadataUtils.setInfo("image-provincestate", ed.ProvinceState);
      metadataUtils.setInfo("image-countryname", ed.CountryName);
      metadataUtils.setInfo("image-copyright", ed.Copyright);
      metadataUtils.setInfo("image-title", ed.Headline);
      metadataUtils.setInfo("image-caption", ed.Caption);
      metadataUtils.setInfo("image-comment", ed.UserComment);
      metadataUtils.setInfo("image-instructions", ed.Instructions);
      metadataUtils.setInfo("image-software", ed.Software);

      if (ed.GPSPureDdLat && ed.GPSPureDdLon) {
        var href = 'http://www.openstreetmap.org/?mlat=%lat%&mlon=%lon%&layers=M';
        try {
          var mapProvider = fxifUtils.getPreferences().getCharPref("mapProvider");
          if(mapProvider.length)
            href = mapProvider;
        } catch(ex) {}
        href = href.replace(/%lat%/g, ed.GPSPureDdLat);
        href = href.replace(/%lon%/g, ed.GPSPureDdLon);
        href = href.replace(/%lang%/g, fxifUtils.getLang());
        document.getElementById("maplink-href").setAttribute("href", href);
      }
      else {
        document.getElementById("image-gpscoord").style.display = "none";
      }
    }
    else {
      // Show at least a message if there's nothing. Else "it just leaves you guessing
      // whether the extension is at fault or what." as a comment on AMO says.
      document.getElementById("copy-button").style.display = "none";
      document.getElementById("data-list").style.display = "none";
    }
  }

  /*
    Simulate a normal link to a new window but obey browser.link.open_newwindow.
    Not using openUILinkIn from utilityOverlay.js since we can't control opening
    of a new tab in foreground/background (resp. it relies on browser.tabs.loadInBackground
    instead of browser.tabs.loadBookmarksInBackground).
  */
  this.loadInBrowser = function (urlstring, event)
  {
    var browser = window.opener.getBrowser();
    try {
      var prefRoot = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("browser.");
      var destpref = prefRoot.getIntPref("link.open_newwindow");
      if (destpref == 1)
        browser.loadURI(urlstring);
      else
      {
        if (destpref == 2)
          window.open(urlstring);
        else
          if (destpref == 3)
          {
            var selectNewTab = !prefRoot.getBoolPref("tabs.loadInBackground");
            if (event.shiftKey)
              selectNewTab = !selectNewTab;
            var tab = browser.addTab(urlstring);
            if (selectNewTab)
              browser.selectedTab = tab;
          }
        }
    } catch(ex) {}
  }

  this.copyDataToClipboard = function ()
  {
    try {
      var data = "";
      // Get all label/value combinations.
      // Relies on each line having one label and one textbox element.
      var labels = document.getElementById("exif-sec").getElementsByTagName("grid")[0].getElementsByTagName("label");
      var values = document.getElementById("exif-sec").getElementsByTagName("grid")[0].getElementsByTagName("textbox");
      for(var i=0; i<labels.length; i++) {
        var val = values[i].value;
        if(val) {
          data += labels[i].value + " " + val + "\r\n";
        }
      }

      if(data != "") {
        var clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"].getService(Components.interfaces.nsIClipboardHelper);
        clipboardHelper.copyString(data);
      }
    }
    catch(ex) {}
  }


  this.onPropertiesOverlayLoad = function ()
  {
    originalLoad();

    stringBundle = document.getElementById("bundle_fxif");
    if(onImage) {
      showEXIFDataFor(document.getElementById("image-url-text").value);
    }
    else {
      document.getElementById("exif-sec").style.display = "none";
    }
  }


  this.onFxIFDataDialogLoad = function ()
  {
    stringBundle = document.getElementById("bundle_fxif");
    var fileName = window.arguments[0]; // imgURL passed to window.openDialog() in showImageData()
    var pos = fileName.lastIndexOf('/');
    // if no /, pos is -1 and the + 1 will result in
    // using the whole string - that's what we want
    window.document.title = stringBundle.getString("windowtitle") + " " + decodeURI(fileName.substr(pos + 1));
    showEXIFDataFor(window.arguments[0]);
  }

  // do initialisation stuff for adding our own
  // context menu entry for Firefox >= 3.6
  this.initMenuItems = function ()
  {
    var contextMenu = document.getElementById("contentAreaContextMenu");
    if (contextMenu)
      contextMenu.addEventListener("popupshowing", fxifObj.visibilityOfMenuItems, false);
  }

  // hides or shows the menu entry depending on the context
  this.visibilityOfMenuItems = function()
  {
    var item1 = document.getElementById("context-fxif");
    var item2 = document.getElementById("context-fxif-sep");

    try {
      // only show the entries if no properties entry available
      var properties_entry = document.getElementById("context-metadata");
//      var bOnImage = imgURL && !properties_entry && gContextMenu.onImage;

      if (!properties_entry && (imgURL = metadataUtils.showMetadataFor(gContextMenu.target))) {
        item1.hidden = false;
        item2.hidden = false;

        // matching url endings of .jpeg, .jpe and .jpg each with
        // optional HTTP GET parameters after a following ?
        var reg_jpg = new RegExp(/\.jp(eg|e|g)(\?.*)?$/i);
        if (reg_jpg.test(imgURL) || isJPEG(imgURL)) {
          item1.disabled = false;
          item2.disabled = false;
        }
        else {
          item1.disabled = true;
          item2.disabled = true;
        }
      }
      else {
        item1.hidden = true;
        item2.hidden = true;
      }
    }
    catch(ex) {
      item1.hidden = true;
      item2.hidden = true;
    }
  }

  this.showImageData = function () {
    window.openDialog("chrome://fxif/content/fxifPropertiesDialog.xul", "_blank", "chrome,resizable", imgURL);
  }

}

var fxifObj = new fxifClass();
