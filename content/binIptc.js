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
 * The Original Code is IPTC interpreter for FxIF.
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
 *  Interpreter for binary IPTC-NAA data.
 */

function iptcClass()
{
  var fxifUtils = new fxifUtilsClass();


  const BIM_MARKER = 0x3842494D; // 8BIM segment marker
  const UTF8_INDICATOR = "\u001B%G"; // indicates usage of UTF8 in IPTC-NAA strings


  // IPTC tags
  const TAG_IPTC_CODEDCHARSET  = 0x5A;
  const TAG_IPTC_INSTRUCTIONS  = 0x28;
  const TAG_IPTC_BYLINE        = 0x50;
  const TAG_IPTC_CITY          = 0x5A;
  const TAG_IPTC_SUBLOCATION   = 0x5C;
  const TAG_IPTC_PROVINCESTATE = 0x5F;
  const TAG_IPTC_COUNTRYNAME   = 0x65;
  const TAG_IPTC_HEADLINE      = 0x69;
  const TAG_IPTC_COPYRIGHT     = 0x74;
  const TAG_IPTC_CAPTION       = 0x78;
  const TAG_IPTC_DATECREATED   = 0x37;
  const TAG_IPTC_TIMECREATED   = 0x3C;


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

  /* Reads the actual IPTC/NAA tags.
     Overwrites information from EXIF tags for textual informations like
     By, Caption, Headline, Copyright.
     But doesn't overwrite those fields when already populated by IPTC4XMP.
     The tag CodedCharacterSet in record 1 is read and interpreted to detect
     if the string data in record 2 is supposed to be UTF-8 coded. For now
     we assume record 1 comes before 2 in the file.
  */
  function readIptcDir(dataObj, data)
  {
    var pos = 0;
    var utf8Strings = false;

    // keep until we're through the whole date because
    // only then we have both values.
    var iptcDate;
    var iptcTime;

    // Don't read outside the array, take the 5 bytes into account
    // since they are mandatory for a proper entry.
    while(pos + 5 <= data.length) {
      var entryMarker = data[pos];
      var entryRecord = data[pos + 1];
      var tag = data[pos + 2];
      // dataLen is really only the length of the data.
      // There are signs, that the highest bit of this int
      // indicates an extended tag. Be aware of this.
      var dataLen = fxifUtils.read16(data, pos + 3, false);
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
              var val = fxifUtils.bytesToString(data, pos + 5, dataLen);
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
              var val = fxifUtils.bytesToString(data, pos + 5, dataLen);
            }
            switch(tag) {
              case TAG_IPTC_DATECREATED:
                  iptcDate = val;
                break;

              case TAG_IPTC_TIMECREATED:
                  iptcTime = val;
                break;

              case TAG_IPTC_BYLINE:
                if(!dataObj.Photographer || !fxifUtils.xmpDone)
                  dataObj.Photographer = val;
                break;

              case TAG_IPTC_CITY:
                if(!dataObj.City || !fxifUtils.xmpDone)
                  dataObj.City = val;
                break;

              case TAG_IPTC_SUBLOCATION:
                if(!dataObj.Sublocation || !fxifUtils.xmpDone)
                  dataObj.Sublocation = val;
                break;

              case TAG_IPTC_PROVINCESTATE:
                if(!dataObj.ProvinceState || !fxifUtils.xmpDone)
                  dataObj.ProvinceState = val;
                break;

              case TAG_IPTC_COUNTRYNAME:
                if(!dataObj.CountryName || !fxifUtils.xmpDone)
                  dataObj.CountryName = val;
                break;

              case TAG_IPTC_CAPTION:
                if(!dataObj.Caption || !fxifUtils.xmpDone)
                  dataObj.Caption = val;
                break;

              case TAG_IPTC_HEADLINE:
                if(!dataObj.Headline || !fxifUtils.xmpDone)
                  dataObj.Headline = val;
                break;

              case TAG_IPTC_COPYRIGHT:
                if(!dataObj.Copyright || !fxifUtils.xmpDone)
                  dataObj.Copyright = val;
                break;

              case TAG_IPTC_INSTRUCTIONS:
                  dataObj.Instructions = val;
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

    // only overwrite existing date if XMP data not already parsed
    if((!dataObj.Date || !fxifUtils.xmpDone) && (iptcDate || iptcTime))
    {
      // if IPTC only contains either date or time, only use it if there’s
      // no date already set
      if ((iptcDate && iptcTime) || !dataObj.Date && (iptcDate && !iptcTime || !iptcDate && iptcTime))
      {
        var date;
        var matches;
        if (iptcDate)
        {
          matches = iptcDate.match(/^(\d{4})(\d{2})(\d{2})$/);
          if (matches)
            date = matches[1] + '-' + matches[2] + '-' + matches[3];
        }
        if (iptcTime)
        {
          matches = iptcTime.match(/^(\d{2})(\d{2})(\d{2})([+-]\d{4})$/);
          if (matches)
          {
            if (date)
              date += ' ';
            date += matches[1] + ':' + matches[2] + ':' + matches[3] + ' ' + matches[4];
          }
        }

        dataObj.Date = date;
      }
    }
  }


  /* Looks for 8BIM markers in this image resources block.
     The format is defined by Adobe and stems from its PSD
     format.
  */
  this.readPsSection = function (dataObj, psData)
  {
    var pointer = 0;

    var segmentMarker = fxifUtils.read32(psData, pointer, false);
    pointer += 4;
    while(segmentMarker == BIM_MARKER &&
          pointer < psData.length) {
      var segmentType = fxifUtils.read16(psData, pointer, false);
      pointer += 2;
      // Step over 8BIM header.
      // It's an even length pascal string, i.e. one byte length information
      // plus string. The whole thing is padded to have an even length.
      var headerLen = psData[pointer];
      pointer += 1 + headerLen + ((headerLen + 1) % 2);

      // read dir length excluding length field
      var segmentLen = fxifUtils.read32(psData, pointer, false);
      pointer += 4;
      // IPTC-NAA record as IIM
      if(segmentType == 0x0404) {
        readIptcDir(dataObj, psData.slice(pointer, pointer + segmentLen));
        break;
      }

      // Dir data, variable length padded to even length.
      pointer += segmentLen + (segmentLen % 2);
      segmentMarker = fxifUtils.read32(psData, pointer, false);
      pointer += 4;
    }
  }
}
