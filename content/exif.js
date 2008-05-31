/*
 * The majority of this code is lifted from JHead by Matthias Wandel
 *  http://www.sentex.net/~mwandel/jhead/
 *
 * The rest is by Ted Mielczarek <luser_mozilla@perilith.com>
 */
const SOI_MARKER = 0xFFD8;  // start of image
const SOS_MARKER = 0xFFDA;  // start of stream
const EXIF_MARKER = 0xFFE1; // start of EXIF data


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

// tags
const TAG_MAKE               = 0x010F;
const TAG_MODEL              = 0x0110;
const TAG_ORIENTATION        = 0x0112;
const TAG_DATETIME           = 0x0132;
const TAG_THUMBNAIL_OFFSET   = 0x0201;
const TAG_THUMBNAIL_LENGTH   = 0x0202;
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

var BytesPerFormat = [0,1,1,2,4,8,1,1,2,4,8,4,8];

var gFXIFbundle;

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

function ConvertAnyFormat(data, format, offset, numbytes, swapbytes)
{
    var value = 0;

    switch(format) {
    case FMT_STRING:
    case FMT_UNDEFINED: // treat as string
      value = bytesToString(data, offset, numbytes);
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
  var gpsLatHemisphere = 'E', gpsLonHemisphere = 'N', gpsAltReference = 0;
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

  // now output all existing values
  if (vals[TAG_GPS_LAT] != undefined) {
    var gpsArr = dd2dms(vals[TAG_GPS_LAT],gpsArr);
    gpsArr.push(gpsLatHemisphere);
    exifObj.GPSLat = gFXIFbundle.getFormattedString("latlon", gpsArr);
  }
  if (vals[TAG_GPS_LON] != undefined) {
    var gpsArr = dd2dms(vals[TAG_GPS_LON],gpsArr);
    gpsArr.push(gpsLonHemisphere);
    exifObj.GPSLon = gFXIFbundle.getFormattedString("latlon", gpsArr);
  }
  if (vals[TAG_GPS_ALT] != undefined) {
    exifObj.GPSAlt = gFXIFbundle.getFormattedString("meters", [vals[TAG_GPS_ALT] * (gpsAltReference ? -1.0 : 1.0)]);
  }
}

function dd2dms(gpsval, gpsArr)
{
  // a bit unconventional calculation to get input border cases
  // like 0x31 / 0x01, 0x0a / 0x01, 0x3c / 0x01 to 49°11'0" instead of 49°10'60"
  var gpsDeg	= Math.floor(gpsval / 3600);
  gpsval -= gpsDeg * 3600.0;
  var gpsMin = Math.floor(gpsval / 60);
  // round to 2 digits after the comma
  var gpsSec = Math.round((gpsval - gpsMin * 60.0) * 100) / 100;
  return Array(gpsDeg,gpsMin,gpsSec);
}

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
      // strip trailing whitespace
      val = val.replace(/\s+$/, '');
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
	exifObj.ISOequivalent = val.toFixed(0);
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
	exifObj.DigitalZoomRatio = val.toFixed(3) + "x";
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

    default:
      ntags--;
    }
  }

  return ntags;
}

function readExifSection(exifData, ifd_ofs, swapbytes)
{
  var exifObj = {};
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

  return exifObj;
}


function exifData(imgUrl)
{
  var exifObj = null;
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
      // see if it's a local file and we can open it
      var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
      var u = ios.newURI(imgUrl, null, null);
      if(u.schemeIs("file")) {
	var fileHandler = ios.getProtocolHandler("file").QueryInterface(Components.interfaces.nsIFileProtocolHandler);
	var f = fileHandler.getFileFromURLSpec(imgUrl);
	istream = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
	istream.init(f, 1, 0, false);
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
      while(marker != SOS_MARKER) {
	// length includes the length bytes
	len = bis.read16() - 2;
	if(marker == EXIF_MARKER) { // bingo!
	  // 6 bytes, 'Exif\0\0'
	  bis.readBytes(6);
	  // 8 byte TIFF header
	  // first two determine byte order
	  var exifData = bis.readByteArray(len - 6);
	  var bi = read16(exifData, 0, false);
	  if(bi == INTEL_BYTE_ORDER) {
	    swapbytes = true;
	  }
	  // next two bytes are always 0x002A
	  // offset to Image File Directory (includes the previous 8 bytes)
	  var ifd_ofs = read32(exifData, 4, swapbytes);
	  exifObj = readExifSection(exifData, ifd_ofs, swapbytes);
	  break;
	}
	else {
	  // read and discard data...
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

  if(ed) {
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
    setInfo("image-gpslat", ed.GPSLat);
    setInfo("image-gpslon", ed.GPSLon);
    setInfo("image-gpsalt", ed.GPSAlt);
    setInfo("image-comment", ed.UserComment);
  }
  else {
    document.getElementById("exif-sec").style.display = "none";
  }
}

function onFxIFLoad()
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

var originalLoad = window.onLoad;
// I don't like this, but I want to make sure that the original onload
// finishes before I run my stuff
window.onLoad = onFxIFLoad;
