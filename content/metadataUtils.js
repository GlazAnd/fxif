/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
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
 * The Original Code is this file as it was released on January 3, 2001.
 *
 * The Initial Developer of the Original Code is
 * Jonas Sicking.
 * Portions created by the Initial Developer are Copyright (C) 2000
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Jonas Sicking <sicking@bigfoot.com> (Original Author)
 *   Gervase Markham <gerv@gerv.net>
 *   Heikki Toivonen <heikki@netscape.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/* Code in this module was taken from chrome://navigator/content/metadata.js */

const XULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

var htmlMode = false;

function showMetadataFor(elem)
{
  // skip past non-element nodes
  while (elem && elem.nodeType != Node.ELEMENT_NODE)
     elem = elem.parentNode;

  if (!elem)
    return;

  if (elem.ownerDocument.getElementsByName && !elem.ownerDocument.namespaceURI)
    htmlMode = true;

  // htmllocalname is "" if it's not an html tag, or the name of the tag if it is.
  var htmllocalname = "";
  if (isHTMLElement(elem, ""))
    htmllocalname = elem.localName.toLowerCase();
  
  return checkForImage(elem, htmllocalname);
}

function checkForImage(elem, htmllocalname)
{
  var img;
  var imgType;   // "img" = <img>
                 // "object" = <object>
                 // "input" = <input type=image>
                 // "background" = css background (to be added later)
  var ismap = false;

  if (htmllocalname === "img") {
      img = elem;
      imgType = "img";

  } else if (htmllocalname === "object" &&
             elem.type.substring(0,6) == "image/" &&
             elem.data) {
      img = elem;
      imgType = "object";

  } else if (htmllocalname === "input" &&
             elem.type.toUpperCase() == "IMAGE") {
      img = elem;
      imgType = "input";

  } else if (htmllocalname === "area" || htmllocalname === "a") {
      // Clicked in image map?
      var map = elem;
      ismap = true;

      while (map && map.nodeType == Node.ELEMENT_NODE && !isHTMLElement(map,"map") )
          map = map.parentNode;

      if (map && map.nodeType == Node.ELEMENT_NODE) {
          img = getImageForMap(map);
          var imgLocalName = img && img.localName.toLowerCase();
          if (imgLocalName == "img" || imgLocalName == "object") {
              imgType = imgLocalName;
          }
      }
  }

  return (!img || imgType == "object") ? null : img.src;
}

/*
 * Set text of node id to value
 * if value="" the node with specified id is hidden.
 * Node should be have one of these forms
 * <xul:label id="id-text" value=""/>
 * <xul:description id="id-text"/>
 */
function setInfo(id, value)
{
  if (!value) {
    hideNode(id);
    return;
  }

  var node = document.getElementById(id + "-text");

  if (node.namespaceURI == XULNS && node.localName == "label" ||
     (node.namespaceURI == XULNS && node.localName == "textbox")) {
    node.setAttribute("value", value);

  } else if (node.namespaceURI == XULNS && node.localName == "description") {
    while (node.hasChildNodes())
      node.removeChild(node.firstChild);
    node.appendChild(node.ownerDocument.createTextNode(value));
  }
}

// name should be in lower case
function isHTMLElement(node, name)
{
  if (node.nodeType != Node.ELEMENT_NODE)
    return false;

  if (htmlMode)
    return !name || node.localName.toLowerCase() == name;

  return (!name || node.localName == name) && node.namespaceURI == XHTMLNS;
}

// Hide node with specified id
function hideNode(id)
{
  var style = document.getElementById(id).getAttribute("style");
  document.getElementById(id).setAttribute("style", "display:none;" + style);
}

/*
 * Find <img> or <object> which uses an imagemap.
 * If more then one object is found we can't determine which one
 * was clicked.
 *
 * This code has to be changed once bug 1882 is fixed.
 * Once bug 72527 is fixed this code should use the .images collection.
 */
function getImageForMap(map)
{
    var mapuri = "#" + map.getAttribute("name");
    var multipleFound = false;
    var img = null;

    var list = getHTMLElements(map.ownerDocument, "img");
    for (var i=0; i < list.length; i++) {
        if (list.item(i).getAttribute("usemap") == mapuri) {
            if (img) {
                multipleFound = true;
                break;
            } else {
                img = list.item(i);
                imgType = "img";
            }
        }
    }

    list = getHTMLElements(map.ownerDocument, "object");
    for (i = 0; i < list.length; i++) {
        if (list.item(i).getAttribute("usemap") == mapuri) {
            if (img) {
              multipleFound = true;
              break;
            } else {
              img = list.item(i);
              imgType = "object";
            }
        }
    }

    if (multipleFound)
        img = null;

    return img;
}

function getHTMLElements(node, name)
{
    if (htmlMode)
        return node.getElementsByTagName(name);
    return node.getElementsByTagNameNS(XHTMLNS, name);
}
