// ==UserScript==
// @name         document.designMode
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  document.designMode='on'
// @author       Euler0525
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    document.designMode = 'on';
})();