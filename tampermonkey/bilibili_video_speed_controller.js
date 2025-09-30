// ==UserScript==
// @name         Bilibili Video Speed Controller
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Control video speed (x0.1-x16.0) using slider or arrow keys
// @author       Euler0525
// @match        https://www.bilibili.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let speed_curr = 1.0;
    const SPEED_MIN = 0.1;
    const SPEED_MAX = 16.0;
    const SPEED_STEP = 0.1;

    // Create control panel container
    const ctrl_pannel = document.createElement('div');
    Object.assign(ctrl_pannel.style, {
        position: 'fixed',
        top: '60px',
        right: '20px',
        backgroundColor: 'rgba(0,0,0,0.6)',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        zIndex: '9999',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        alignItems: 'center',
        fontFamily: 'Arial, sans-serif'
    });

    // Speed display element
    const speed_display = document.createElement('div');
    speed_display.textContent = `Current Speed: x${speed_curr}`;
    speed_display.style.fontSize = '16px';

    // Speed slider element
    const speed_slider = document.createElement('input');
    speed_slider.type = 'range';
    speed_slider.min = SPEED_MIN;
    speed_slider.max = SPEED_MAX;
    speed_slider.step = SPEED_STEP;
    speed_slider.value = speed_curr;
    speed_slider.style.width = '150px';
    speed_slider.style.cursor = 'pointer';

    // Hotkey hint element
    const hotkey_hint = document.createElement('div');
    hotkey_hint.textContent = 'Shortcuts ↑/↓ ';
    hotkey_hint.style.fontSize = '12px';
    hotkey_hint.style.opacity = '0.8';

    // Assemble control panel
    ctrl_pannel.appendChild(speed_display);
    ctrl_pannel.appendChild(speed_slider);
    ctrl_pannel.appendChild(hotkey_hint);
    document.body.appendChild(ctrl_pannel);

    // Update video speed and UI
    function updateSpeed(speed_new) {
        speed_curr = Math.min(Math.max(speed_new, SPEED_MIN), SPEED_MAX);

        // Apply to all video elements
        const videos = document.getElementsByTagName('video');
        for (let video of videos) {
            // video.playbackRate = speed_curr;
            video.playbackRate = speed_curr.toFixed(1)
        }

        // Update display components
        speed_display.textContent = `Current Speed: x${speed_curr.toFixed(1)}`;
        speed_slider.value = speed_curr.toFixed(1);
    }

    // Slider input handler
    speed_slider.addEventListener('input', (e) => {
        updateSpeed(parseFloat(e.target.value));
    });

    // // Keyboard shortcut handler
    // document.addEventListener('keydown', function (event) {
    //     // Ignore inputs when focused on form elements
    //     if (document.activeElement.tagName === 'INPUT' ||
    //         document.activeElement.tagName === 'TEXTAREA') return;

    //     switch (event.key) {
    //         case 'ArrowUp':
    //             event.preventDefault();
    //             updateSpeed(speed_curr + SPEED_STEP);
    //             break;
    //         case 'ArrowDown':
    //             event.preventDefault();
    //             updateSpeed(speed_curr - SPEED_STEP);
    //             break;
    //     }
    // }, true);

    // MutationObserver to detect dynamically loaded videos
    const video_observer = new MutationObserver(() => {
        const videos = document.getElementsByTagName('video');
        for (let video of videos) {
            if (video.playbackRate !== speed_curr.toFixed(1)) {
                // video.playbackRate = speed_curr;
                video.playbackRate = speed_curr.toFixed(1)
            }
        }
    });

    // Start observing DOM changes
    video_observer.observe(document, {
        childList: true,
        subtree: true
    });

    // Initialize existing videos after page load
    setTimeout(() => {
        const initial_videos = document.getElementsByTagName('video');
        for (let video of initial_videos) {
            // video.playbackRate = speed_curr;
            video.playbackRate = speed_curr.toFixed(1)
        }
    }, 1000);
})();