/*
 * The majority of this code is lifted from JHead by Matthias Wandel
 *  http://www.sentex.net/~mwandel/jhead/
 *
 * IPTC and XMP code is by Christian Eyrich <ch.ey@gmx.net>
 * The rest is by Ted Mielczarek <luser_mozilla@perilith.com>
 */
const SOI_MARKER = 0xFFD8;  // start of image
const SOS_MARKER = 0xFFDA;  // start of stream
const EOI_MARKER = 0xFFD9;  // end of image
const APP1_MARKER = 0xFFE1; // start of EXIF data
const APP13_MARKER = 0xFFED; // start of IPTC-NAA data
const BIM_MARKER = 0x3842494D; // 8BIM segment marker
const UTF8_INDICATOR = "\u001B%G"; // indicates usage of UTF8 in IPTC-NAA strings


const INTEL_BYTE_ORDER = 0x4949;

// data formats
const FMT_BYTE       = 1;
const FMT_STRING     = 2;
const FMT_USHORT     = 3;
const FMT_ULONG      = 4;
const FMT_URATIONAL  = 5;
const FMT_SBYTE      = 6;
const FMT_UNDEFINED  = 7;
const FMT_SSHORT     = 8;
const FMT_SLONG      = 9;
const FMT_SRATIONAL  = 10;
const FMT_SINGLE     = 11;
const FMT_DOUBLE     = 12;

// exif tags
const TAG_DESCRIPTION        = 0x010E;
const TAG_MAKE               = 0x010F;
const TAG_MODEL              = 0x0110;
const TAG_ORIENTATION        = 0x0112;
const TAG_DATETIME           = 0x0132;
const TAG_ARTIST             = 0x013B;
const TAG_THUMBNAIL_OFFSET   = 0x0201;
const TAG_THUMBNAIL_LENGTH   = 0x0202;
const TAG_COPYRIGHT          = 0x8298;
const TAG_EXPOSURETIME       = 0x829A;
const TAG_FNUMBER            = 0x829D;
const TAG_EXIF_OFFSET        = 0x8769;
const TAG_EXPOSURE_PROGRAM   = 0x8822;
const TAG_GPSINFO            = 0x8825;
const TAG_ISO_EQUIVALENT     = 0x8827;
const TAG_DATETIME_ORIGINAL  = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;
const TAG_SHUTTERSPEED       = 0x9201;
const TAG_APERTURE           = 0x9202;
const TAG_EXPOSURE_BIAS      = 0x9204;
const TAG_MAXAPERTURE        = 0x9205;
const TAG_SUBJECT_DISTANCE   = 0x9206;
const TAG_METERING_MODE      = 0x9207;
const TAG_LIGHT_SOURCE       = 0x9208;
const TAG_FLASH              = 0x9209;
const TAG_FOCALLENGTH        = 0x920A;
const TAG_MAKER_NOTE         = 0x927C;
const TAG_USERCOMMENT        = 0x9286;
const TAG_EXIF_IMAGEWIDTH    = 0xa002;
const TAG_EXIF_IMAGELENGTH   = 0xa003;
const TAG_INTEROP_OFFSET     = 0xa005;
const TAG_FOCALPLANEXRES     = 0xa20E;
const TAG_FOCALPLANEUNITS    = 0xa210;
const TAG_EXPOSURE_INDEX     = 0xa215;
const TAG_EXPOSURE_MODE      = 0xa402;
const TAG_WHITEBALANCE       = 0xa403;
const TAG_DIGITALZOOMRATIO   = 0xA404;
const TAG_FOCALLENGTH_35MM   = 0xa405;

const TAG_GPS_LAT_REF    = 1;
const TAG_GPS_LAT        = 2;
const TAG_GPS_LON_REF    = 3;
const TAG_GPS_LON        = 4;
const TAG_GPS_ALT_REF    = 5;
const TAG_GPS_ALT        = 6;

// iptc tags
const TAG_IPTC_CODEDCHARSET  = 0x5A;
const TAG_IPTC_BYLINE        = 0x50;
const TAG_IPTC_HEADLINE      = 0x69;
const TAG_IPTC_COPYRIGHT     = 0x74;
const TAG_IPTC_CAPTION       = 0x78;

var BytesPerFormat = [0,1,1,2,4,8,1,1,2,4,8,4,8];

var Node = {
  ELEMENT_NODE:1, ATTRIBUTE_NODE:2, TEXT_NODE:3, CDATA_SECTION_NODE:4,
  ENTITY_REFERENCE_NODE:5, ENTITY_NODE:6, PROCESSING_INSTRUCTION_NODE:7,
  COMMENT_NODE:8, DOCUMENT_NODE:9, DOCUMENT_TYPE_NODE:10,
  DOCUMENT_FRAGMENT_NODE:11, NOTATION_NODE:12
};


var gFXIFbundle;
var prefInstance = null;
var exifDone = false;
var iptcDone = false;
var xmpDone = false;
var imgURL = null;

var originalLoad = window.onLoad;

function read32(data, offset, swapbytes)
{
  if(!swapbytes)
    return (data[offset] << 24) | (data[offset+1] << 16) | (data[offset+2] << 8) | data[offset+3];

  return data[offset] | (data[offset+1] << 8) | (data[offset+2] << 16) | (data[offset+3] << 24);
}

function read16(data, offset, swapbytes)
{
  if(!swapbytes)
    return (data[offset] << 8) | data[offset+1];

  return data[offset] | (data[offset+1] << 8);
}

function dir_entry_addr(start, entry)
{
  return start + 2 + 12*entry;
}

function bytesToString(data, offset, num)
{
  var s = "";

  for(var i=offset; i<offset+num; i++) {
    if(data[i] == 0)
      continue;

    s += String.fromCharCode(data[i]);
  }

  return s;
}

// Decodes arrays carrying UTF-8 sequences into Unicode strings.
// Filters out illegal bytes with values between 128 and 191,
// but doesn't validate sequences.
// To do this each of the follow up bytes in the three
// ifs must be tested for (c>>6) == 2 or equivalent.
function utf8BytesToString(utf8data, offset, num)
{
  var s = "";
  var c = c1 = c2 = 0;

  for(var i=offset; i<offset+num;) {
    c = utf8data[i];
    if(c <= 127) {
      s += String.fromCharCode(c);
      i++;
    }
    else if((c >= 192) && (c <= 223)) {
      c2 = utf8data[i+1];
      s += String.fromCharCode(((c&31) << 6) | (c2&63));
      i += 2;
    }
    else if((c >= 224) && (c <= 239)) {
      c2 = utf8data[i+1];
      c3 = utf8data[i+2];
      s += String.fromCharCode(((c&15) << 12) | ((c2&63) << 6) | (c3&63));
      i += 3;
    }
    else if(c >= 240) {
      c2 = utf8data[i+1];
      c3 = utf8data[i+2];
      c4 = utf8data[i+3];
      s += String.fromCharCode(((c & 7) << 18) | ((c2&63) << 12) | ((c3&63) << 6) | (c4&63));
      i += 4;
    }
    else {
      i++;
    }
  }

  return s;
}

function ConvertAnyFormat(data, format, offset, numbytes, swapbytes)
{
    var value = 0;

    switch(format) {
    case FMT_STRING:
    case FMT_UNDEFINED: // treat as string
      value = bytesToString(data, offset, numbytes);
      // strip trailing whitespace
      value = value.replace(/\s+$/, '');
      break;

    case FMT_SBYTE:     value = data[offset];  break;
    case FMT_BYTE:      value = data[offset];  break;

    case FMT_USHORT:    value = read16(data, offset, swapbytes);  break;
    case FMT_ULONG:     value = read32(data, offset, swapbytes);  break;

    case FMT_URATIONAL:
    case FMT_SRATIONAL:
      {
        var Num,Den;
        Num = read32(data, offset, swapbytes);
        Den = read32(data, offset+4, swapbytes);
        if (Den == 0){
          value = 0;
        }else{
          value = Num/Den;
        }
        break;
      }

    case FMT_SSHORT:    Value = read16(data, offset, swapbytes); break;
    case FMT_SLONG:     Value = read32(data, offset, swapbytes); break;

      // ignore, probably never used
    case FMT_SINGLE:    value = 0; break;
    case FMT_DOUBLE:    value = 0; break;
    }
    return value;
}

function readGPSDir(exifObj, data, dirstart, swapbytes)
{
  var numEntries = read16(data, dirstart, swapbytes);
  var gpsLatHemisphere = 'N', gpsLonHemisphere = 'E', gpsAltReference = 0;
  var gpsLat, gpsLon, gpsAlt;
  var vals = new Array();

  for(var i=0; i<numEntries; i++) {
    var entry = dir_entry_addr(dirstart, i);
    var tag = read16(data, entry, swapbytes);
    var format = read16(data, entry+2, swapbytes);
    var components = read32(data, entry+4, swapbytes);

    if(format >= BytesPerFormat.length)
      continue;

    var nbytes = components * BytesPerFormat[format];
    var valueoffset;

    if(nbytes <= 4) { // stored in the entry
      valueoffset = entry + 8;
    }
    else {
      valueoffset = read32(data, entry + 8, swapbytes);
    }
    
    var val = ConvertAnyFormat(data, format, valueoffset, nbytes, swapbytes);

    switch(tag) {
    case TAG_GPS_LAT_REF:
      gpsLatHemisphere = val;
      break;

    case TAG_GPS_LON_REF:
      gpsLonHemisphere = val;
      break;

    case TAG_GPS_ALT_REF:
      gpsAltReference = val;
      break;

    case TAG_GPS_LAT:
    case TAG_GPS_LON:
      // data is saved as three 64bit rationals -> 24 bytes
      // so we've to do another two ConvertAnyFormat() ourself
      // e.g. 0x0b / 0x01, 0x07 / 0x01, 0x011c4d / 0x0c92
      // but can also be only 0x31 / 0x01, 0x3d8ba / 0x2710, 0x0 / 0x01
      var gpsval = val * 3600;
      gpsval += ConvertAnyFormat(data, format, valueoffset+8, nbytes, swapbytes) * 60;
      gpsval += ConvertAnyFormat(data, format, valueoffset+16, nbytes, swapbytes);
      vals[tag] = gpsval;
      break;

    case TAG_GPS_ALT:
      vals[tag] = val;
      break;

    default:
      break;
    }
  }

  // use dms format by default
  var degFormat = "dms";
  var degFormatter = dd2dms;
  try {
    // 0 = DMS, 1 = DD
    if (getPreferences().getIntPref("gpsFormat"))
    {
      // but dd if the user wants that
      degFormat = "dd";
      degFormatter = dd2dd;
    }
  } catch(e){}
  // now output all existing values
  if (vals[TAG_GPS_LAT] != undefined) {
    var gpsArr = degFormatter(vals[TAG_GPS_LAT]);
    gpsArr.push(gpsLatHemisphere);
    exifObj.GPSLat = gFXIFbundle.getFormattedString("latlon"+degFormat, gpsArr);
  }
  if (vals[TAG_GPS_LON] != undefined) {
    var gpsArr = degFormatter(vals[TAG_GPS_LON]);
    gpsArr.push(gpsLonHemisphere);
    exifObj.GPSLon = gFXIFbundle.getFormattedString("latlon"+degFormat, gpsArr);
  }
  if (vals[TAG_GPS_ALT] != undefined) {
    exifObj.GPSAlt = gFXIFbundle.getFormattedString("meters", [vals[TAG_GPS_ALT] * (gpsAltReference ? -1.0 : 1.0)]);
  }

  // Get the straight decimal values without rounding.
  // For creating links to map services.
  if (vals[TAG_GPS_LAT] != undefined &&
      vals[TAG_GPS_LON] != undefined) {
    exifObj.GPSPureDdLat = vals[TAG_GPS_LAT] / 3600 * (gpsLatHemisphere == 'N' ? 1.0 : -1.0);
    exifObj.GPSPureDdLon = vals[TAG_GPS_LON] / 3600 * (gpsLonHemisphere == 'E' ? 1.0 : -1.0);
  }
}

function dd2dms(gpsval)
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

function dd2dd(gpsval)
{
  // round to 6 digits after the comma
  var gpsArr = new Array();
  gpsArr.push((gpsval / 3600).toFixed(6));
  return gpsArr;
}

/* Reads the actual EXIF tags.
   Also extracts tags for textual informations like
   By, Caption, Headline, Copyright. 
   But doesn't overwrite those fields when already populated
   by IPTC-NAA or IPTC4XMP.
*/
function readExifDir(exifObj, data, dirstart, swapbytes)
{
  var ntags = 0;
  var numEntries = read16(data, dirstart, swapbytes);

  for(var i=0; i<numEntries; i++) {
    var entry = dir_entry_addr(dirstart, i);
    var tag = read16(data, entry, swapbytes);
    var format = read16(data, entry+2, swapbytes);
    var components = read32(data, entry+4, swapbytes);

    if(format >= BytesPerFormat.length)
      continue;

    var nbytes = components * BytesPerFormat[format];
    var valueoffset;

    if(nbytes <= 4) { // stored in the entry
      valueoffset = entry + 8;
    }
    else {
      valueoffset = read32(data, entry + 8, swapbytes);
    }
    
    var val = ConvertAnyFormat(data, format, valueoffset, nbytes, swapbytes);

    ntags++;
    switch(tag) {
    case TAG_MAKE:
      exifObj.Make = val;
      break;

    case TAG_MODEL:
      exifObj.Model = val;
      break;

    case TAG_DATETIME_ORIGINAL:
      exifObj.Date = val;
      break;

    case TAG_DATETIME_DIGITIZED:
    case TAG_DATETIME:
      if(!exifObj.Date)
        exifObj.Date = val;
      break;

    case TAG_USERCOMMENT:
      // strip leading ASCII string
      exifObj.UserComment = val.replace(/^ASCII\s*/, '');
      break;
      
    case TAG_FNUMBER:
      exifObj.ApertureFNumber = "f/" + parseFloat(val).toFixed(1);
      break;

      // only use these if we don't have the previous
    case TAG_APERTURE:
    case TAG_MAXAPERTURE:
      if(!exifObj.ApertureFNumber) {
        exifObj.ApertureFNumber = "f/" + (parseFloat(val) * Math.log(2) * 0.5).toFixed(1);
      }
      break;

    case TAG_FOCALLENGTH:
      exifObj.FocalLength = parseFloat(val);
      break;

    case TAG_SUBJECT_DISTANCE:
      if(val < 0) {
        exifObj.Distance = gFXIFbundle.getString("infinite");
      }
      else {
        exifObj.Distance = gFXIFbundle.getFormattedString("meters", [val]);
      }
      break;

    case TAG_EXPOSURETIME:
      var et = "";
      val = parseFloat(val);
      if (val < 0.010) {
        et = gFXIFbundle.getFormattedString("seconds", [val.toFixed(4)]);
      }else {
        et = gFXIFbundle.getFormattedString("seconds", [val.toFixed(3)]);
      }
      if (val <= 0.5){
        et += " (1/" + Math.floor(0.5 + 1/val).toFixed(0) + ")";
      }
      exifObj.ExposureTime = et;
      break;

    case TAG_SHUTTERSPEED:
      if(!exifObj.ExposureTime) {
        exifObj.ExposureTime = gFXIFbundle.getFormattedString("seconds", [(1.0 / Math.exp(parseFloat(val) * Math.log(2))).toFixed(4)]);
      }
      break;

    case TAG_FLASH:
      if(val >= 0) {
        var fu;
        if(val & 1) {
          fu = gFXIFbundle.getString("yes");

          switch(val) {
            case 0x5:
              fu += " (" + gFXIFbundle.getString("nostrobe") + ")";
              break;
            case 0x7:
              fu += " (" + gFXIFbundle.getString("strobe") + ")";
              break;
            case 0x9:
              fu += " (" + gFXIFbundle.getString("manual") + ")";
              break;
            case 0xd:
              fu += " (" + gFXIFbundle.getString("manual") + ", " 
                + gFXIFbundle.getString("noreturnlight") + ")";
              break;
            case 0xf:
              fu += " (" + gFXIFbundle.getString("manual") + ", " 
                + gFXIFbundle.getString("returnlight") + ")";
              break;
            case 0x19:
              fu += " (" + gFXIFbundle.getString("auto") + ")";
              break;
            case 0x1d:
              fu += " (" + gFXIFbundle.getString("auto") + ", " 
                + gFXIFbundle.getString("noreturnlight") + ")";
              break;
            case 0x1f:
              fu += " (" + gFXIFbundle.getString("manual") + ", " 
                + gFXIFbundle.getString("returnlight") + ")";
              break;
            case 0x41:
              fu += " (" + gFXIFbundle.getString("redeye") + ")";
              break;
            case 0x45:
              fu += " (" + gFXIFbundle.getString("redeye")
                + gFXIFbundle.getString("noreturnlight") + ")";
              break;
            case 0x47:
              fu += " (" + gFXIFbundle.getString("redeye")
                + gFXIFbundle.getString("returnlight") + ")";
              break;
            case 0x49:
              fu += " (" + gFXIFbundle.getString("manual") + ", "
                + gFXIFbundle.getString("redeye") + ")";
              break;
            case 0x4d:
              fu += " (" + gFXIFbundle.getString("manual")  + ", "
                + gFXIFbundle.getString("redeye") + ", "
                + gFXIFbundle.getString("noreturnlight") + ")";
              break;
            case 0x4f:
              fu += " (" + gFXIFbundle.getString("redeye")  + ", "
                + gFXIFbundle.getString("redeye") + ", "
                + gFXIFbundle.getString("returnlight") + ")";
              break;
            case 0x59:
              fu += " (" + gFXIFbundle.getString("auto") + ", "
                + gFXIFbundle.getString("redeye") + ")";
              break;
            case 0x5d:
              fu += " (" + gFXIFbundle.getString("auto")  + ", "
                + gFXIFbundle.getString("redeye") + ", "
                + gFXIFbundle.getString("noreturnlight") + ")";
              brak;
            case 0x5f:
              fu += " (" + gFXIFbundle.getString("auto")  + ", "
                + gFXIFbundle.getString("redeye") + ", "
                + gFXIFbundle.getString("returnlight") + ")";
              break;
          }
        }
        else {
          fu = gFXIFbundle.getString("no");
          switch (val) {
            case 0x18: fu += " (" + gFXIFbundle.getString("auto") + ")"; break;
          }
        }
        exifObj.FlashUsed = fu;
      }
      break;

    case TAG_ORIENTATION:
      if(!exifObj.Orientation && val > 1) {
        exifObj.Orientation = gFXIFbundle.getString("orientation" + val);
      }
      break;

    case TAG_EXIF_IMAGELENGTH:
      exifObj.Length = val;
      break;

    case TAG_EXIF_IMAGEWIDTH:
      exifObj.Width = val;
      break;

    case TAG_FOCALPLANEXRES:
      exifObj.FocalPlaneXRes = val;
      break;

    case TAG_FOCALPLANEUNITS:
      switch(val) {
        case 1: exifObj.FocalPlaneUnits = 25.4; break; // inch
        case 2: 
          // According to the information I was using, 2 means meters.
          // But looking at the Cannon powershot's files, inches is the only
          // sensible value.
          exifObj.FocalPlaneUnits = 25.4;
          break;

        case 3: exifObj.FocalPlaneUnits = 10;   break;  // centimeter
        case 4: exifObj.FocalPlaneUnits = 1;    break;  // millimeter
        case 5: exifObj.FocalPlaneUnits = .001; break;  // micrometer
      }
      break;

    case TAG_EXPOSURE_BIAS:
      if(val != 0) {
        exifObj.ExposureBias = parseFloat(val).toFixed(2);
      }
      break;

    case TAG_WHITEBALANCE:
      switch(val) {
        case 0: 
          exifObj.WhiteBalance = gFXIFbundle.getString("auto"); 
          break;
        case 1:
          exifObj.WhiteBalance = gFXIFbundle.getString("manual");
          break;
      }
      break;

    case TAG_LIGHT_SOURCE:
      switch(val) {
        case 1:
          exifObj.LightSource = gFXIFbundle.getString("daylight");
          break;
        case 2:
          exifObj.LightSource = gFXIFbundle.getString("fluorescent");
          break;
        case 3:
          exifObj.LightSource = gFXIFbundle.getString("incandescent");
          break;
        case 4:
          exifObj.LightSource = gFXIFbundle.getString("flash");
          break;
        case 9:
          exifObj.LightSource = gFXIFbundle.getString("fineweather");
          break;
        case 11:
          exifObj.LightSource = gFXIFbundle.getString("shade");
          break;
        default:; //Quercus: 17-1-2004 There are many more modes for this, check Exif2.2 specs
        // If it just says 'unknown' or we don't know it, then
        // don't bother showing it - it doesn't add any useful information.
      }
      break;

    case TAG_METERING_MODE:
      switch(val) {
        case 2:
          exifObj.MeteringMode = gFXIFbundle.getString("centerweight");
          break;
        case 3:
          exifObj.MeteringMode = gFXIFbundle.getString("spot");
          break;
        case 5:
          exifObj.MeteringMode = gFXIFbundle.getString("matrix");
          break;
      }
      break;

    case TAG_EXPOSURE_PROGRAM:
      switch(val) {
        case 1:
          exifObj.ExposureProgram = gFXIFbundle.getString("manual");
          break;
        case 2:
          exifObj.ExposureProgram = gFXIFbundle.getString("program") + " (" 
            + gFXIFbundle.getString("auto") + ")";
          break;
        case 3:
          exifObj.ExposureProgram = gFXIFbundle.getString("apriority")
            + " (" +gFXIFbundle.getString("semiauto") + ")";
          break;
        case 4:
          exifObj.ExposureProgram = gFXIFbundle.getString("spriority")
            + " (" + gFXIFbundle.getString("semiauto") +")";
          break;
        case 5:
          exifObj.ExposureProgram = gFXIFbundle.getString("creative");
          break;
        case 6:
          exifObj.ExposureProgram = gFXIFbundle.getString("action");
          break;
        case 7:
          exifObj.ExposureProgram = gFXIFbundle.getString("portrait");
          break;
        case 8:
          exifObj.ExposureProgram = gFXIFbundle.getString("landscape");
          break;
        default:
        break;
      }
      break;

    case TAG_EXPOSURE_INDEX:
      if (!exifObj.ISOequivalent) {
        ExifObj.ISOequivalent = val.toFixed(0);
      }
      break;

    case TAG_EXPOSURE_MODE:
      switch(val) {
        case 0: //Automatic
          break;
        case 1:
          exifObj.ExposureMode = gFXIFbundle.getString("manual");
          break;
        case 2:
          exifObj.ExposureMode = gFXIFbundle.getString("autobracketing");
          break;
      }
      break;

    case TAG_ISO_EQUIVALENT:
      exifObj.ISOequivalent = val.toFixed(0);
      
      if (exifObj.ISOequivalent < 50 ){
        // Fixes strange encoding on some older digicams.
        exifObj.ISOequivalent *= 200;
      }
      break;

    case TAG_DIGITALZOOMRATIO:
      if(val > 1) {
        ExifObj.DigitalZoomRatio = val.toFixed(3) + "x";
      }
      break;

    case TAG_THUMBNAIL_OFFSET:
      break;

    case TAG_THUMBNAIL_LENGTH:
      break;

    case TAG_FOCALLENGTH_35MM:
      exifObj.FocalLength35mmEquiv = val;
      break;

    case TAG_EXIF_OFFSET:
    case TAG_INTEROP_OFFSET:
      ntags += readExifDir(exifObj, data, val, swapbytes);
      break;

    case TAG_GPSINFO:
      readGPSDir(exifObj, data, val, swapbytes);
      break;

    case TAG_ARTIST:
      if(!exifObj.Photographer)
        exifObj.Photographer = val;
      break;

    case TAG_COPYRIGHT:
      if(!exifObj.Copyright)
        exifObj.Copyright = val;
      break;

    case TAG_DESCRIPTION:
      if(!exifObj.Caption)
        exifObj.Caption = val;
      break;

    default:
      ntags--;
    }
  }

  return ntags;
}

function readExifSection(exifObj, exifData, ifd_ofs, swapbytes)
{
  var ntags = readExifDir(exifObj, exifData, ifd_ofs, swapbytes);
  if(ntags == 0) {
    return null;
  }

  // compute a few things
  if(exifObj.FocalPlaneXRes && exifObj.FocalPlaneUnits) {
    // don't convert to str just yet
    exifObj.CCDWidth = (exifObj.Width * exifObj.FocalPlaneUnits / exifObj.FocalPlaneXRes);
    
    // don't calculate 35mm equivalent for Canon, some of their Digital SLRs
    // have a crop factor that's not specified in the EXIF anywhere
    if(exifObj.FocalLength && !exifObj.FocalLength35mmEquiv && !exifObj.Make.match(/Canon/)) {
      exifObj.FocalLength35mmEquiv = (exifObj.FocalLength / exifObj.CCDWidth*36  + 0.5).toFixed(0);
    }

    exifObj.CCDWidth = gFXIFbundle.getFormattedString("millimeters", [exifObj.CCDWidth.toFixed(2)]);
  }

  if(exifObj.FocalLength) {
    exifObj.FocalLength = parseFloat(exifObj.FocalLength);
    var fl = gFXIFbundle.getFormattedString("millimeters", [exifObj.FocalLength.toFixed(1)]);
    if(exifObj.FocalLength35mmEquiv) {
      exifObj.FocalLength35mmEquiv = parseFloat(exifObj.FocalLength35mmEquiv);
      fl += " " + gFXIFbundle.getFormattedString("35mmequiv", [exifObj.FocalLength35mmEquiv.toFixed(0)]);
    }

    exifObj.FocalLengthText = fl;
  }
}

/* Reads the actual IPTC/NAA tags.
   Overwrites information from EXIF tags for textual informations like
   By, Caption, Headline, Copyright.
   But doesn't overwrite those fields when already populated by IPTC4XMP.
   The tag CodedCharacterSet in record 1 is read and interpreted to detect
   if the string data in record 2 is supposed to be UTF-8 coded. For now
   we assume record 1 comes before 2 in the file.
*/
function readIptcDir(iptcObj, data)
{
  var pos = 0;
  var utf8Strings = false;

  // Don't read outside the array, take the 5 bytes into account
  // since they are mandatory for a proper entry.
  while(pos + 5 <= data.length) {
    var entryMarker = data[pos];
    var entryRecord = data[pos + 1];
    var tag = data[pos + 2];
    // dataLen is really only the length of the data.
    // There are signs, that the highest bit of this int
    // indicates an extended tag. Be aware of this.
    var dataLen = read16(data, pos + 3, false);
    if(entryMarker == 0x1C) {
      if(entryRecord == 0x01) {
        // Only use tags with length > 0, tags without actual data are common.
        if(dataLen > 0) {
          if(pos + 5 + dataLen > data.length) {   // Don't read outside the array.
            var read = pos + 5 + dataLen;
            alert("Read outside of array, read to: " + read + ", array length: " + data.length);
            break;
          }
          if(tag == TAG_IPTC_CODEDCHARSET) {
            var val = bytesToString(data, pos + 5, dataLen);
            // ESC %G
            if(val == UTF8_INDICATOR) {
                utf8Strings = true;
            }
          }
        }
      }
      else
      if(entryRecord == 0x02) {
        // Only use tags with length > 0, tags without actual data are common.
        if(dataLen > 0) {
          if(pos + 5 + dataLen > data.length) {   // Don't read outside the array.
            var read = pos + 5 + dataLen;
            alert("Read outside of array, read to: " + read + ", array length: " + data.length);
            break;
          }
          if(utf8Strings) {
            var val = utf8BytesToString(data, pos + 5, dataLen);
          }
          else {
            var val = bytesToString(data, pos + 5, dataLen);
          }
          switch(tag) {
            case TAG_IPTC_BYLINE:
              if(!iptcObj.Photographer || !xmpDone)
                iptcObj.Photographer = val;
              break;
    
            case TAG_IPTC_CAPTION:
              if(!iptcObj.Caption || !xmpDone)
                iptcObj.Caption = val;
              break;
    
            case TAG_IPTC_HEADLINE:
              if(!iptcObj.Headline || !xmpDone)
                iptcObj.Headline = val;
              break;
    
            case TAG_IPTC_COPYRIGHT:
              if(!iptcObj.Copyright || !xmpDone)
                iptcObj.Copyright = val;
              break;
          }
        }
      }
      else
      {
//      alert("Tag: " + tag + ", dataLen: " + dataLen);
      }
    }
    else {
      alert("Wrong entryMarker (" + entryMarker + ")");
      break;
    }

    pos += 5 + dataLen;
  }
}


/* Looks for 8BIM markers in this image resources block.
   The format is defined by Adobe and stems from its PSD
   format.
*/
function readPsSection(iptcObj, psData)
{
  var pointer = 0;

  var segmentMarker = read32(psData, pointer, false);
  pointer += 4;
  while(segmentMarker == BIM_MARKER &&
        pointer < psData.length) {
    var segmentType = read16(psData, pointer, false);
    pointer += 2;
    // Step over 8BIM header.
    // It's an even length pascal string, i.e. one byte length information
    // plus string. The whole thing is padded to have an even length.
    var headerLen = psData[pointer];
    pointer += 1 + headerLen + ((headerLen + 1) % 2);

    // read dir length excluding length field
    var segmentLen = read32(psData, pointer, false);
    pointer += 4;
    // IPTC-NAA record as IIM
    if(segmentType == 0x0404) {
      readIptcDir(iptcObj, psData.slice(pointer, pointer + segmentLen));
      break;
    }

    // Dir data, variable length padded to even length.
    pointer += segmentLen + (segmentLen % 2);
    segmentMarker = read32(psData, pointer, false);
    pointer += 4;
  }
}

function exifData(imgUrl)
{
  var exifObj = {};
  var istream = null;

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

  try {
    if(!istream) {
      var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
      var u = ios.newURI(imgUrl, null, null);
      // if it's a web resource, load it with bypassing the cache
      if(u.schemeIs("http") ||
         u.schemeIs("https")) {
				var c = ios.newChannelFromURI(u);
				c.loadFlags |= Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE;
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
        // no input stream and not a local file.  oh well.
        // might be in the process of loading or just not
        // cached.
        return null;
      }
    }

    var bis = Components.classes["@mozilla.org/binaryinputstream;1"].createInstance(Components.interfaces.nsIBinaryInputStream);
    bis.setInputStream(istream);
    var swapbytes = false;
    var marker = bis.read16();
    var len;
    if(marker == SOI_MARKER) {
      marker = bis.read16();
      // reading SOS marker indicates start of image stream
      while(marker != SOS_MARKER &&
            (!exifDone || !iptcDone || !xmpDone)) {
        // length includes the length bytes
        len = bis.read16() - 2;

        if(marker == APP1_MARKER) {
          // For Exif the first 6 bytes should be 'Exif\0\0'
          var header = bis.readBytes(6);
          // Is it EXIF?
          if(header == 'Exif\0\0') {
            // 8 byte TIFF header
            // first two determine byte order
            var exifData = bis.readByteArray(len - 6);

            swapbytes = read16(exifData, 0, false) == INTEL_BYTE_ORDER;

            // next two bytes are always 0x002A
            // offset to Image File Directory (includes the previous 8 bytes)
            var ifd_ofs = read32(exifData, 4, swapbytes);
            readExifSection(exifObj, exifData, ifd_ofs, swapbytes);
            exifDone = true;
          }
          else {
            // Maybe it's XMP. If it is, it starts with the XMP namespace URI
            // 'http://ns.adobe.com/xap/1.0/\0'.
            // see http://partners.adobe.com/public/developer/en/xmp/sdk/XMPspecification.pdf
            header += bis.readBytes(23);  // 6 bytes read means 23 more to go
            var xmpData = bis.readByteArray(len - 29);
            if(header == 'http://ns.adobe.com/xap/1.0/\0') {
              parseXML(exifObj, xmpData);
              xmpDone = true;
            }
          }
        }
        else
          // Or is it IPTC-NAA record as IIM?
          if(marker == APP13_MARKER) {
            // 6 bytes, 'Photoshop 3.0\0'
            var psString = bis.readBytes(14);
            var psData = bis.readByteArray(len - 14);
            if(psString == 'Photoshop 3.0\0') {
              readPsSection(exifObj, psData);
              iptcDone = true;
            }
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
    return null;
  }

  return exifObj;
}

// Parses and reads through the XMP document within the file.
// Currently the getElementsByTagNameNS() methods are used
// for Firefox 2 (Gecko 1.8) compatibility. These are ugly and
// complicated. Should remove this when Firefox 3 is widespread.
function parseXML(exifObj, xml)
{
  var parser = new DOMParser();
  var dom = parser.parseFromBuffer(xml, xml.length, 'text/xml');
  if (dom.documentElement.nodeName == 'parsererror') {
    alert("Error parsing XML");
    return 'Parsing Error!';
  }

  var val = "";

  // Creators come in an ordered list. Get them all.
//  val = getXMPOrderedArray(dom, "dc:creator");
  val = getXMPOrderedArray(dom, "http://purl.org/dc/elements/1.1/", "creator");
  if(val.length) {
    exifObj.Photographer = val;
  }

//  var el = dom.getElementsByTagName("photoshop:Headline");
  var el = dom.getElementsByTagNameNS("http://ns.adobe.com/photoshop/1.0/", "Headline");
  if(el.length) {
    var headline = el[0].firstChild.nodeValue;
    exifObj.Headline = headline;
  }

  var lang = getLang();
  // Build a regular expression to be used to test the language
  // alternatives available in the XMP.
  var langTest = new RegExp("^"+lang.match(/^[a-z]{2,3}/i), "i")

//  val = getXMPAltValue(dom, "dc:description", langTest);
  val = getXMPAltValue(dom, "http://purl.org/dc/elements/1.1/", "description", langTest);
  if(val.length) {
    exifObj.Caption = val;
  }

//  val = getXMPAltValue(dom, "dc:rights", langTest);
  val = getXMPAltValue(dom, "http://purl.org/dc/elements/1.1/", "rights", langTest);
  if(val.length) {
    exifObj.Copyright = val;
  }
}

// Retrieves the language which is likely to be the users favourite
// Currently we end up using only the first language code.
function getLang()
{
  // Get the browsers language as default, only use the primary part of the string.
  // That's a bit laborious since defLang must be a string, no array.
  var nl = navigator.language.match(/^[a-z]{2,3}/i);
  var defLang = nl.length ? nl[0] : "en";
  var lang = defLang;
  // See if we can get a user provided preferred language.
  try {
    var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
    lang = prefService.getBranch("intl.").getCharPref("accept_languages");
  } catch (e) {}
  if(!lang.length)  // maybe the pref was empty
    lang = defLang;
  // To really get a clean code.
//  lang = lang.split(",")[0].replace(/\s/g, '');
  lang = lang.match(/[a-z]{2,3}/i)[0];

  return lang;
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
//  var el = dom.getElementsByTagName(property);
  var el = dom.getElementsByTagNameNS(ns, property);
  if(!el.length) {
    return "";
  }
//  var list = el[0].getElementsByTagName("rdf:li");
  var list = el[0].getElementsByTagNameNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "li");
  var val = "";

  for(var i = 1; i < list.length; i++)
  {
    if(langTest.test(list[i].getAttribute("xml:lang"))) {
      val = list[i].firstChild.nodeValue;
      break;
    }
  }
  // our language wasn't found
  if(!val.length &&
     list.length > 0) {
    val = list[0].firstChild.nodeValue;
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

//  var el = dom.getElementsByTagName(property);
  var el = dom.getElementsByTagNameNS(ns, property);
  if(el.length) {
//    var list = el[0].getElementsByTagName("rdf:li");
    var list = el[0].getElementsByTagNameNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "li");
    for(var i=0; i<list.length; i++) {
      var el = list[i].firstChild;
      if(el.nodeType == Node.TEXT_NODE) {  // it's just the photographer
        val += el.nodeValue + ", ";
      }
// This part is untested due do lack of software that writes that.
      else if(el.nodeType == Node.ELEMENT_NODE) {
        // Above li contains a rdf:Description which contains the rdf:value and a ns:role.
//        var list = el.getElementsByTagName("rdf:value");
        var list = el.getElementsByTagNameNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "value");
        if(list.length)
          val += list[0].firstChild.nodeValue + ", ";
      }
      else {
        alert("Uh, unknown nodeType: " + el.nodeType);
      }
    }
    // Remove last, superfluous comma.
    val = val.replace(/, $/, '');
  }

  return val;
}

function copyEXIFToClipboard()
{
  try {
    var data = "";
    // get all values first
    var lbls = document.getElementById("exif-sec").getElementsByTagName("grid")[0].getElementsByTagName("label");
    for(var i=0; i<lbls.length; i++) {
      var val = lbls[i].nextSibling.value;
      if(val) {
        data += lbls[i].value + " " + val + "\r\n";
      }
    }

    if(data != "") {
      var clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"].getService(Components.interfaces.nsIClipboardHelper);
      clipboardHelper.copyString(data);
    }
  }
  catch(ex) {}
}

function showEXIFDataFor(url)
{
  var ed = exifData(url);
  // ed always exists, so we need a way to find out
  // if it's empty or not.
  // This is the best idea I could come up with, any better idea?
  var edEmpty = true;
  for(var tmp in ed) {
    edEmpty = false;
    break;
  }

  if(!edEmpty) {
    document.getElementById("no-data").style.display = "none";
    setInfo("camera-make", ed.Make);
    setInfo("camera-model", ed.Model);
    setInfo("image-date", ed.Date);
    setInfo("image-orientation", ed.Orientation);
    setInfo("image-bw", ed.IsColor);
    setInfo("image-flash", ed.FlashUsed);
    setInfo("image-focallen", ed.FocalLengthText);
    setInfo("image-digitalzoom", ed.DigitalZoomRatio);
    setInfo("image-ccdwidth", ed.CCDWidth);
    setInfo("image-exposuretime", ed.ExposureTime);
    setInfo("image-aperture", ed.ApertureFNumber);
    setInfo("image-focusdist", ed.Distance);
    setInfo("image-isoequiv", ed.ISOequivalent);
    setInfo("image-exposurebias", ed.ExposureBias);
    setInfo("image-whitebalance", ed.WhiteBalance);
    setInfo("image-lightsource", ed.LightSource);
    setInfo("image-meteringmode", ed.MeteringMode);
    setInfo("image-exposureprogram", ed.ExposureProgram);
    setInfo("image-exposuremode", ed.ExposureMode);
    setInfo("image-gpscoord", ed.GPSLat + ", " + ed.GPSLon);
    setInfo("image-gpsalt", ed.GPSAlt);
    setInfo("image-photographer", ed.Photographer);
    setInfo("image-copyright", ed.Copyright);
    setInfo("image-title", ed.Headline);
    setInfo("image-caption", ed.Caption);
    setInfo("image-comment", ed.UserComment);

    if (ed.GPSPureDdLat && ed.GPSPureDdLon) {
      var href = 'http://www.openstreetmap.org/?mlat=%lat%&mlon=%lon%&layers=B000FTF';
      try {
        var mapProvider = getPreferences().getCharPref("mapProvider");
        if(mapProvider.length)
          href = mapProvider;
      } catch(e) {}
      href = href.replace(/%lat%/g, ed.GPSPureDdLat);
      href = href.replace(/%lon%/g, ed.GPSPureDdLon);
      href = href.replace(/%lang%/g, getLang());
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

function onFxIFOverlayLoad()
{
  originalLoad();

  gFXIFbundle = document.getElementById("bundle_fxif");
  if(onImage) {
    var imgURL = document.getElementById("image-url-text").value;
    showEXIFDataFor(imgURL);
  }
  else {
    document.getElementById("exif-sec").style.display = "none";
  }
}

function onFxIFDialogLoad()
{
  gFXIFbundle = document.getElementById("bundle_fxif");
  var fileName = window.arguments[0];
  var pos = fileName.lastIndexOf('/');
  // if no /, pos is -1 and the + 1 will
  // result in using whole string - that's what we want
  window.document.title = gFXIFbundle.getString("contextMenu.label") + " " + decodeURI(fileName.substr(pos + 1));
  showEXIFDataFor(window.arguments[0]);
}

function getPreferences()
{
  if (!prefInstance) {
    try {
      var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
      prefInstance = prefService.getBranch("extensions.fxif."); // preferences extensions.fxif node
    } catch (e) {}
  }

  return prefInstance;
}

/*
  Simulate a normal link to a new window but obey browser.link.open_newwindow.
  Not using openUILinkIn from utilityOverlay.js since we can't control opening
  of a new tab in foreground/background (resp. it relies on browser.tabs.loadInBackground
  instead of browser.tabs.loadBookmarksInBackground).
*/
function loadInBrowser(urlstring, event)
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
  } catch(e) {}
}

// do initialisation stuff for adding our own
// context menu entry for Firefox >= 3.6
function fxifInitMenuItems()
{
	var contextMenu = document.getElementById("contentAreaContextMenu");
  if (contextMenu)
    contextMenu.addEventListener("popupshowing", showFxIFMenuItems, false);
}

// do initialisation stuff for adding our own
// context menu entry for Firefox >= 3.6
function fxifInitDialogs()
{
  // I don't like this, but I want to make sure that the original onload
  // finishes before I run my stuff
  window.onLoad = onFxIFLoad;
}

// hide or show the menu entry depending on the context
function showFxIFMenuItems()
{
	var reg_jpg = new RegExp('\.jp(eg|e|g)(\\?.*)?$', 'i');

  showMetadataFor(gContextMenu.target);

  // only display the entries if no properties entry available
  var properties_entry = document.getElementById("context-metadata");
	var bOnImage = imgURL && !properties_entry && gContextMenu.onImage && reg_jpg.test(imgURL);

	var item1 = document.getElementById("context-fxif");
	var item2 = document.getElementById("context-fxif-sep");
	if (bOnImage) {
		item1.hidden = false;
		item2.hidden = false;
	}
	else {
		item1.hidden = true;
		item2.hidden = true;
	}
}

function showImageExifs() {
  window.openDialog("chrome://fxif/content/fxifPropertiesDialog.xul", "fxif_properties", "chrome,resizable", imgURL);
}
