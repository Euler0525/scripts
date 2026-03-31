// ==UserScript==
// @name         Browser Dark Mode
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description
// @author       Euler0525
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';
    console.time('Tampermonkey Script Execution');

    //FIXME Add default excluded websites (supporting regular expressions)
    const excludedPatterns = [
        /euler0525/,
        /google/,
        /.edu/ //XXX
    ];

    const currentHost = window.location.hostname;

    if (excludedPatterns.some(pattern => pattern.test(currentHost))) {
        return;
    }

    // Default enabled
    let isEnabled = GM_getValue('eyeCareEnabled', true);

    // Basic CSS Style
    const baseCSS = `
        .eye-care-invert {
            filter: invert(0.9) hue-rotate(180deg) contrast(0.85) brightness(1.1) !important;
            -webkit-filter: invert(0.9) hue-rotate(180deg) contrast(0.85) brightness(1.1) !important;
        }

        .eye-care-invert img,
        .eye-care-invert video,
        .eye-care-invert iframe,
        .eye-care-invert canvas,
        .eye-care-invert svg,
        .eye-care-invert [style*="background-image"] {
            filter: invert(1) hue-rotate(180deg) !important;
            -webkit-filter: invert(1) hue-rotate(180deg) !important;
        }

        ::-webkit-scrollbar {
            width: 12px;
        }

        ::-webkit-scrollbar-thumb {
            background-color: #555;
            border-radius: 6px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background-color: #666;
        }

        #eye-care-toggle {
            position: fixed;
            left: 20px;
            bottom: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background-color: #333;
            color: #fff;
            border: 2px solid #555;
            cursor: pointer;
            z-index: 999999;
            font-size: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.6;
            transition: opacity 0.3s, transform 0.2s;
            user-select: none;
        }

        #eye-care-toggle:hover {
            opacity: 1;
            transform: scale(1.1);
        }

        #eye-care-toggle.disabled {
            background-color: #666;
            border-color: #888;
        }
    `;

    GM_addStyle(baseCSS);

    function getLuminance(r, g, b) {
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    function getBackgroundColor(element) {
        const style = window.getComputedStyle(element);
        const bgColor = style.backgroundColor;

        if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
            if (element.parentElement && element.parentElement !== document.body) {
                return getBackgroundColor(element.parentElement);
            }
            return 'rgb(255, 255, 255)';
        }
        return bgColor;
    }

    function parseRGB(colorStr) {
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        }
        return [255, 255, 255];
    }

    // Brightness threshold: 128
    function shouldInvert(element) {
        const bgColor = getBackgroundColor(element);
        const [r, g, b] = parseRGB(bgColor);
        const luminance = getLuminance(r, g, b);

        return luminance > 128;
    }

    function applySmartInvert() {
        if (!isEnabled) {
            const root = document.documentElement || document.body;
            if (root) {
                root.classList.remove('eye-care-invert');
            }
            return;
        }

        const root = document.documentElement || document.body;
        if (root && shouldInvert(root)) {
            root.classList.add('eye-care-invert');
        }
    }

    function createToggleButton() {
        const button = document.createElement('button');
        button.id = 'eye-care-toggle';
        button.innerHTML = isEnabled ? '👁️' : '🚫';
        button.title = isEnabled ? '护眼模式：开启' : '护眼模式：关闭';

        if (!isEnabled) {
            button.classList.add('disabled');
        }

        button.addEventListener('click', function () {
            isEnabled = !isEnabled;
            GM_setValue('eyeCareEnabled', isEnabled);

            button.innerHTML = isEnabled ? '👁️' : '🚫';
            button.title = isEnabled ? '护眼模式：开启' : '护眼模式：关闭';

            if (isEnabled) {
                button.classList.remove('disabled');
            } else {
                button.classList.add('disabled');
            }

            applySmartInvert();
        });

        document.body.appendChild(button);
    }

    function init() {
        applySmartInvert();
        createToggleButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    const observer = new MutationObserver(() => {
        applySmartInvert();
    });

    function startObserver() {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } else {
            setTimeout(startObserver, 100);
        }
    }
    startObserver();

    console.timeEnd('Tampermonkey Script Execution');
})();
