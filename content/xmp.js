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
 * The Original Code is XMP interpreter for FxIF.
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
 *  Interpreter for XML XMP data.
 */

function xmpClass(stringBundle)
{
  var fxifUtils = new fxifUtilsClass();

  var NodeTypes = {
    ELEMENT_NODE:1, ATTRIBUTE_NODE:2, TEXT_NODE:3, CDATA_SECTION_NODE:4,
    ENTITY_REFERENCE_NODE:5, ENTITY_NODE:6, PROCESSING_INSTRUCTION_NODE:7,
    COMMENT_NODE:8, DOCUMENT_NODE:9, DOCUMENT_TYPE_NODE:10,
    DOCUMENT_FRAGMENT_NODE:11, NOTATION_NODE:12
  };


  // Parses and reads through the XMP document within the file.
  // Currently the getElementsByTagNameNS() methods are used
  // for Firefox 2 (Gecko 1.8) compatibility. These are ugly and
  // complicated. Should remove this when Firefox 3 is widespread.
  this.parseXML = function (dataObj, xml)
  {
    var parser = new DOMParser();
    var dom = parser.parseFromBuffer(xml, xml.length, 'text/xml');
    if (dom.documentElement.nodeName == 'parsererror') {
      alert("Error parsing XML");
      return 'Parsing Error!';
    }

    var val;

    // Creators come in an ordered list. Get them all.
//    val = getXMPOrderedArray(dom, "dc:creator");
    val = getXMPOrderedArray(dom, "http://purl.org/dc/elements/1.1/", "creator");
    if(val && val.length) {
      dataObj.Photographer = val;
    }

    val = getXMPValue(dom, "http://ns.adobe.com/photoshop/1.0/", "City");
    if (val)
      dataObj.City = val;

    val = getXMPValue(dom, "http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/", "Location");
    if (val)
      dataObj.Sublocation = val;

    val = getXMPValue(dom, "http://ns.adobe.com/photoshop/1.0/", "State");
    if (val)
      dataObj.ProvinceState = val;

    val = getXMPValue(dom, "http://ns.adobe.com/photoshop/1.0/", "Country");
    if (val)
      dataObj.CountryName = val;

    val = getXMPValue(dom, "http://ns.adobe.com/photoshop/1.0/", "Headline");
    if (val)
      dataObj.Headline = val;

    val = getXMPValue(dom, "http://ns.adobe.com/photoshop/1.0/", "Instructions");
    if (val)
      dataObj.Instructions = val;


    var lang = fxifUtils.getLang();
    // Build a regular expression to be used to test the language
    // alternatives available in the XMP.
    var langTest = new RegExp("^"+lang.match(/^[a-z]{2,3}/i), "i")

    if (!dataObj.Headline)
    {
      val = getXMPAltValue(dom, "http://purl.org/dc/elements/1.1/", "title", langTest);
      if(val) {
        dataObj.Headline = val;
      }
    }

//    val = getXMPAltValue(dom, "dc:description", langTest);
    val = getXMPAltValue(dom, "http://purl.org/dc/elements/1.1/", "description", langTest);
    if(val) {
      dataObj.Caption = val;
    }

//    val = getXMPAltValue(dom, "dc:rights", langTest);
    val = getXMPAltValue(dom, "http://purl.org/dc/elements/1.1/", "rights", langTest);
    if(val)
      dataObj.Copyright = val;
    else
    {
      val = getXMPAltValue(dom, "http://ns.adobe.com/xap/1.0/rights/", "UsageTerms ", langTest);
      if(val)
        dataObj.Copyright = val;
      else
        val = getXMPValue(dom, "http://creativecommons.org/ns#", "license");
    }
    if(val)
      dataObj.Copyright = val;



    // XMP:EXIF

    val = getXMPValue(dom, "http://ns.adobe.com/tiff/1.0/", "Make");
    if (val)
      dataObj.Make = val;

    val = getXMPValue(dom, "http://ns.adobe.com/tiff/1.0/", "Model");
    if (val)
      dataObj.Model = val;

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/aux/", "Lens");
    if (val)
      dataObj.Lens = val;

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "DateTimeOriginal");
    if (val) {
      var date = readAndFormatISODate(val);
      if (date)
        dataObj.Date = date;
    }

    if(!dataObj.Date)
    {
      val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "DateTimeDigitized");
      if (val) {
        var date = readAndFormatISODate(val);
        if (date)
          dataObj.Date = date;
      }
    }

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "FNumber");
    if (!val)
      val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "ApertureValue");
    if (val)
      dataObj.ApertureFNumber = "f/" + parseRational(val).toFixed(1);

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "FocalLength");
    if (val)
      dataObj.FocalLength = parseRational(val).toFixed(1);

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "FocalLengthIn35mmFilm");
    if (!val)
      // this name is no official but written by some applications
      val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "FocalLengthIn35mmFormat");
    if (val)
      dataObj.FocalLength35mmEquiv = val;

    if(dataObj.FocalLength) {
      var fl = stringBundle.getFormattedString("millimeters", [dataObj.FocalLength]);
      if(dataObj.FocalLength35mmEquiv) {
        dataObj.FocalLength35mmEquiv = parseFloat(dataObj.FocalLength35mmEquiv);
        fl += " " + stringBundle.getFormattedString("35mmequiv", [dataObj.FocalLength35mmEquiv.toFixed(0)]);
      }

      dataObj.FocalLengthText = fl;
    }

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "SubjectDistance");
    if (val)
    {
      var distance = parseRational(val).toFixed(2);
      if(distance < 0)
        dataObj.Distance = stringBundle.getString("infinite");
      else
        dataObj.Distance = stringBundle.getFormattedString("meters", [distance]);
    }

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "ExposureTime");
    if (val)
    {
      var et = "";
      val = parseRational(val);
      if (val < 0.010)
        et = stringBundle.getFormattedString("seconds", [val.toFixed(4)]);
      else
        et = stringBundle.getFormattedString("seconds", [val.toFixed(3)]);
      if (val <= 0.5)
        et += " (1/" + Math.floor(0.5 + 1/val).toFixed(0) + ")";
      dataObj.ExposureTime = et;
    }

    var el = dom.getElementsByTagNameNS("http://ns.adobe.com/exif/1.0/", "Flash");
    var flashFired = 0;
    var flashFunction = 0;
    var flashMode = 0;
    var redEyeMode = 0;
    var flashReturn = 0;
    if(el.length) {
      flashFired = el[0].getAttributeNS("http://ns.adobe.com/exif/1.0/", "Fired");
      flashFunction = el[0].getAttributeNS("http://ns.adobe.com/exif/1.0/", "Function");
      flashMode = Number(el[0].getAttributeNS("http://ns.adobe.com/exif/1.0/", "Mode"));
      redEyeMode = el[0].getAttributeNS("http://ns.adobe.com/exif/1.0/", "RedEyeMode");
      flashReturn = Number(el[0].getAttributeNS("http://ns.adobe.com/exif/1.0/", "Return"));

      var fu;
      if(flashFired && flashFired.match(/^true$/i)) {
        fu = stringBundle.getString("yes");

        var addfunc = new Array();
        if(flashMode == 3)
          addfunc.push(stringBundle.getString("auto"));
        else
          if(flashMode == 1)
            addfunc.push(stringBundle.getString("manual"));

        if(redEyeMode.match(/^true$/i))
          addfunc.push(stringBundle.getString("redeye"));

        if(flashReturn == 3)
          addfunc.push(stringBundle.getString("returnlight"));
        else
          if(flashReturn == 2)
            addfunc.push(stringBundle.getString("noreturnlight"));

        if (addfunc.length)
          fu += " (" + addfunc.join(", ") + ")";
      }
      else {
        fu = stringBundle.getString("no");
        if(flashMode == 2)
          fu += " (" + stringBundle.getString("manual") + ")";
        else
          if(flashMode == 3)
            fu += " (" + stringBundle.getString("auto") + ")";
      }
      dataObj.FlashUsed = fu;
    }

    val = getXMPValue(dom, "http://ns.adobe.com/tiff/1.0/", "Orientation");
    if(!dataObj.Orientation && val && val > 1)
      dataObj.Orientation = stringBundle.getString("orientation" + val);

    val = getXMPValue(dom, "http://ns.adobe.com/tiff/1.0/", "ImageHeight");
    if(val)
      dataObj.Length = val;

    val = getXMPValue(dom, "http://ns.adobe.com/tiff/1.0/", "ImageWidth");
    if(val)
      dataObj.Width = val;

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "FocalPlaneXResolution");
    if(val)
      dataObj.FocalPlaneXRes = val;

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "FocalPlaneResolutionUnit");
    if(val) {
      switch(Number(val)) {
        case 1: dataObj.FocalPlaneUnits = 25.4; break; // inches
        case 2:
          // According to the information I was using, 2 means meters.
          // But looking at the Cannon powershot's files, inches is the only
          // sensible value.
          dataObj.FocalPlaneUnits = 25.4;
          break;
        case 3: dataObj.FocalPlaneUnits = 10;   break;  // centimeter
        case 4: dataObj.FocalPlaneUnits = 1;    break;  // millimeter
        case 5: dataObj.FocalPlaneUnits = .001; break;  // micrometer
      }
    }

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "ExposureBiasValue");
    if(val) {
      val = parseRational(val).toFixed(2);
      if(val == 0)
        dataObj.ExposureBias = stringBundle.getString("none");
      else
        // add a + sign before positive values
        dataObj.ExposureBias = (val > 0 ? '+' : '') + stringBundle.getFormattedString("ev", [val]);
    }

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "WhiteBalance");
    if(val) {
      switch(Number(val)) {
        case 0:
          dataObj.WhiteBalance = stringBundle.getString("auto");
          break;
        case 1:
          dataObj.WhiteBalance = stringBundle.getString("manual");
          break;
      }
    }

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "LightSource");
    if(val) {
      switch(Number(val)) {
        case 0:
          dataObj.LightSource = stringBundle.getString("unknown");
          break;
        case 1:
          dataObj.LightSource = stringBundle.getString("daylight");
          break;
        case 2:
          dataObj.LightSource = stringBundle.getString("fluorescent");
          break;
        case 3:
          dataObj.LightSource = stringBundle.getString("incandescent");
          break;
        case 4:
          dataObj.LightSource = stringBundle.getString("flash");
          break;
        case 9:
          dataObj.LightSource = stringBundle.getString("fineweather");
          break;
        case 10:
          dataObj.LightSource = stringBundle.getString("cloudy");
          break;
        case 11:
          dataObj.LightSource = stringBundle.getString("shade");
          break;
        case 12:
          dataObj.LightSource = stringBundle.getString("daylightfluorescent");
          break;
        case 13:
          dataObj.LightSource = stringBundle.getString("daywhitefluorescent");
          break;
        case 14:
          dataObj.LightSource = stringBundle.getString("coolwhitefluorescent");
          break;
        case 15:
          dataObj.LightSource = stringBundle.getString("whitefluorescent");
          break;
        case 24:
          dataObj.LightSource = stringBundle.getString("studiotungsten");
          break;
        default:; //Quercus: 17-1-2004 There are many more modes for this, check Exif2.2 specs
        // If it just says 'unknown' or we don't know it, then
        // don't bother showing it - it doesn't add any useful information.
      }
    }

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "MeteringMode");
    if(val) {
      switch(Number(val)) {
        case 0:
          dataObj.MeteringMode = stringBundle.getString("unknown");
          break;
        case 1:
          dataObj.MeteringMode = stringBundle.getString("average");
          break;
        case 2:
          dataObj.MeteringMode = stringBundle.getString("centerweight");
          break;
        case 3:
          dataObj.MeteringMode = stringBundle.getString("spot");
          break;
        case 3:
          dataObj.MeteringMode = stringBundle.getString("multispot");
          break;
        case 5:
          dataObj.MeteringMode = stringBundle.getString("matrix");
          break;
        case 6:
          dataObj.MeteringMode = stringBundle.getString("partial");
          break;
      }
    }

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "ExposureProgram");
    if(val) {
      switch(Number(val)) {
        case 1:
          dataObj.ExposureProgram = stringBundle.getString("manual");
          break;
        case 2:
          dataObj.ExposureProgram = stringBundle.getString("program") + " ("
            + stringBundle.getString("auto") + ")";
          break;
        case 3:
          dataObj.ExposureProgram = stringBundle.getString("apriority")
            + " (" + stringBundle.getString("semiauto") + ")";
          break;
        case 4:
          dataObj.ExposureProgram = stringBundle.getString("spriority")
            + " (" + stringBundle.getString("semiauto") +")";
          break;
        case 5:
          dataObj.ExposureProgram = stringBundle.getString("creative");
          break;
        case 6:
          dataObj.ExposureProgram = stringBundle.getString("action");
          break;
        case 7:
          dataObj.ExposureProgram = stringBundle.getString("portrait");
          break;
        case 8:
          dataObj.ExposureProgram = stringBundle.getString("landscape");
          break;
        default:
        break;
      }
    }

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "ExposureIndex");
    if(val) {
      if (!dataObj.ExposureIndex)
        dataObj.ExposureIndex = parseRational(val).toFixed(0);
    }

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "ExposureMode");
    if(val) {
      switch(Number(val)) {
        case 0: //Automatic
          break;
        case 1:
          dataObj.ExposureMode = stringBundle.getString("manual");
          break;
        case 2:
          dataObj.ExposureMode = stringBundle.getString("autobracketing");
          break;
      }
    }

    val = getXMPOrderedArray(dom, "http://ns.adobe.com/exif/1.0/", "ISOSpeedRatings");
    if(val && val.length)
      dataObj.ISOequivalent = val;

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "DigitalZoomRatio");
    if (val && val > 1)
      dataObj.DigitalZoomRatio = parseRational(val).toFixed(3) + "x";

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "ColorSpace");
    if (val)
    {
      if(val == 1)
        dataObj.ColorSpace = "sRGB";
      else if(val == 2)
        dataObj.ColorSpace = "Adobe RGB";
    }

    if (!dataObj.ColorSpace)
    {
      // At least Photoshop writes ColorSpace "uncallibrated" though it uses
      // a defined colorspace which is documented in ICCProfile
      val = getXMPValue(dom, "http://ns.adobe.com/photoshop/1.0/", "ICCProfile");
      if(val)
        dataObj.ColorSpace = val;
    }

    // GPS stuff

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "GPSAltitude");
    var gpsAlt;
    if (val)
      gpsAlt = parseRational(val);

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "GPSAltitudeRef");
    var gpsAltRef = 0;
    if (val)
      gpsAltRef = Number(val);

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "GPSLatitude");
    var gpsLat;
    if (val)
      gpsLat = parseGPSPos(val);

    val = getXMPValue(dom, "http://ns.adobe.com/exif/1.0/", "GPSLongitude");
    var gpsLon;
    if (val)
      gpsLon = parseGPSPos(val);


    // use dms format by default
    var degFormat = "dms";
    var degFormatter = fxifUtils.dd2dms;
    try {
      // 0 = DMS, 1 = DD
      if (fxifUtils.getPreferences().getIntPref("gpsFormat"))
      {
        // but dd if the user wants that
        degFormat = "dd";
        degFormatter = fxifUtils.dd2dd;
      }
    } catch(e){}

    if (gpsLat != undefined) {
      var gpsArr = degFormatter(Math.abs(gpsLat));
      gpsArr.push(gpsLat < 0 ? 'S' : 'N');
      dataObj.GPSLat = stringBundle.getFormattedString("latlon"+degFormat, gpsArr);
    }
    if (gpsLon != undefined) {
      var gpsArr = degFormatter(Math.abs(gpsLon));
      gpsArr.push(gpsLon < 0 ? 'W' : 'E');
      dataObj.GPSLon = stringBundle.getFormattedString("latlon"+degFormat, gpsArr);
    }
    if (gpsAlt != undefined) {
      dataObj.GPSAlt = stringBundle.getFormattedString("meters", [gpsAlt * (gpsAltRef ? -1.0 : 1.0)]);
    }

    // Get the straight decimal values without rounding.
    // For creating links to map services.
    if (gpsLat != undefined &&
        gpsLon != undefined) {
      dataObj.GPSPureDdLat = gpsLat / 3600;
      dataObj.GPSPureDdLon = gpsLon / 3600;
    }
  }

  // Parse a GPS datum.
  // It's stored like 49,9.8672N
  function parseGPSPos(gpsstring)
  {
    var matches = gpsstring.match(/^(\d{1,3}).([0-9.]+) ?([NSEW])$/);
    if (matches)
    {
      var val = matches[1] * 3600 + matches[2] * 60;
      val = val * (matches[3] == 'N' || matches[3] == 'E' ? 1.0 : -1.0);
      return val;
    }
  }


  // Parse rational numbers. They consist of two
  // integers separated by a "/".
  function parseRational(ratstring)
  {
    var matches = ratstring.match(/^([+-]?\d+)\/(\d+)$/);
    if (matches)
    {
      var val = matches[1] / matches[2];
      return val;
    }
    else
      return 0;
  }

  // Since JS can't really parse dates and keep timezone informations,
  // I only break the string up and reformat it without any JS functions.
  // Input format is YYYY:MM:DDTHH:MM:SS[.SS][+/-HH:MM] and
  // Outputformat is YYYY:MM:DD HH:MM:SS [+/-HH:MM]
  function readAndFormatISODate(datestring)
  {
  //  var exploded_date = datestring.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:.\d{2})?(?:([+-])(\d{2}):(\d{2}))?$/);
    var exploded_date = datestring.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:.\d{2})?(?:([+-])(\d{2}):(\d{2}))?$/);
    if (exploded_date)
    {
      date = exploded_date[1] + ' ' + exploded_date[2];
      if (typeof exploded_date[3] != "undefined" && exploded_date[3].length > 0)
        date += ' ' + exploded_date[3] + exploded_date[4] + exploded_date[5];
      return date;
    }
  }



  // Retrieves a property stored somewhere in the XMP data.
  // Unfortunately there are at least two common ways a property
  // value can be stored.
  // 1. As property value of an element
  // 2. As content of an element with name of the property
  // This function looks for both and returns the first one found.
  // ns "http://ns.adobe.com/exif/1.0/"
  // property "FNumber"
  function getXMPValue(dom, ns, property)
  {
    var el = dom.getElementsByTagNameNS(ns, property);
    if(el.length && el[0].hasChildNodes())
      return el[0].firstChild.nodeValue;

    var list = dom.getElementsByTagNameNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "Description");
    var val = "";

    for(var i = 0; i < list.length; i++)
    {
      var attr = list[i].getAttributeNS(ns, property);
      if(attr)
        return attr;
    }
  }

  // Gets names and descriptions that can be available
  // in multiple alternative languages.
  // But only those in the first structure with the
  // given property name is fetched.
  // Currently the getElementsByTagNameNS() methods are used
  // for Firefox 2 (Gecko 1.8) compatibility. These are ugly and
  // complicated. Should remove this when Firefox 3 is widespread.
  //function getXMPAltValue(dom, property, langTest)
  function getXMPAltValue(dom, ns, property, langTest)
  {
    var val;

//    var propertyList = dom.getElementsByTagName(property);
    var propertyList = dom.getElementsByTagNameNS(ns, property);

    // go through all the property elements (though there should
    // only be one)
    for(var i = 0; i < propertyList.length && !val; i++)
    {
//      var entriesList = propertyList[0].getElementsByTagName("rdf:li");
      var entriesList = propertyList[0].getElementsByTagNameNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "li");

      for(var j = 0; j < entriesList.length; j++)
      {
        // found a non empty entry with fitting language
        if(entriesList[j].hasChildNodes() &&
           langTest.test(entriesList[j].getAttribute("xml:lang"))) {
          val = entriesList[j].firstChild.nodeValue;
          break;
        }
      }
    }
    // our language wasn't found or its entry was empty
    for(var i = 0; i < propertyList.length && !val; i++)
    {
      var entriesList = propertyList[0].getElementsByTagNameNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "li");

      for(var j = 0; j < entriesList.length; j++)
      {
        // found a non empty entry with fitting language
        if(entriesList[j].hasChildNodes() &&
           entriesList[j].getAttribute("xml:lang") == "x-default") {
          val = entriesList[j].firstChild.nodeValue;
          break;
        }
      }
    }

    return val;
  }

  // Get all entries from an ordered array.
  // Elements might be straight text nodes or come
  // with a property qualifier in a more complex organisation.
  // Currently the getElementsByTagNameNS() methods are used
  // for Firefox 2 (Gecko 1.8) compatibility. These are ugly and
  // complicated. Should remove this when Firefox 3 is widespread.
  //function getXMPOrderedArray(dom, property)
  function getXMPOrderedArray(dom, ns, property)
  {
    var val = "";

//    var el = dom.getElementsByTagName(property);
    var el = dom.getElementsByTagNameNS(ns, property);
    if(el.length) {
//      var list = el[0].getElementsByTagName("rdf:li");
      var list = el[0].getElementsByTagNameNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "li");
      for(var i = 0; i < list.length; i++) {
        if (list[i].hasChildNodes()) {
          var el = list[i].firstChild;
          if(el.nodeType == NodeTypes.TEXT_NODE)  // it's just the photographer
            val += el.nodeValue + ", ";
//   This part is untested due do lack of software that writes that.
          else if(el.nodeType == NodeTypes.ELEMENT_NODE) {
            // Above li contains a rdf:Description which contains the rdf:value and a ns:role.
//            var list = el.getElementsByTagName("rdf:value");
            var list = el.getElementsByTagNameNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "value");
            if(list.length && list[0].hasChildNodes())
              val += list[0].firstChild.nodeValue + ", ";
          }
          else
            alert("Uh, unknown nodeType: " + el.nodeType);
        }
      }
      // Remove last, superfluous comma.
      val = val.replace(/, $/, '');
    }

    return val;
  }
}
