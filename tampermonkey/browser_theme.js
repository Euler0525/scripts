// ==UserScript==
// @name         护眼主题
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在柔和明亮主题与柔和暗黑主题之间切换
// @author       Euler0525
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'eye_care_theme';
  const STYLE_ID = 'eye-care-theme-style';
  const BTN_ID = 'eye-care-theme-btn';

  // 柔和暖光主题 — 类似纸质书的米黄色调
  const lightTheme = `
    html {
      filter: none !important;
    }
    body {
      background-color: #f5f0e8 !important;
      color: #3b3a36 !important;
    }
    * {
      border-color: #d6cfc2 !important;
      scrollbar-color: #c4bdb0 #f5f0e8;
    }
    a { color: #5a7a5a !important; }
    a:visited { color: #7a6a5a !important; }
    input, textarea, select, button {
      background-color: #ece7dc !important;
      color: #3b3a36 !important;
      border-color: #cdc5b4 !important;
    }
    img, video, canvas, svg, iframe {
      filter: none !important;
    }
    ::selection {
      background-color: #c8d8c0 !important;
      color: #2e2e2a !important;
    }
  `;

  // 柔和暗色主题 — 深灰绿底色，避免纯黑
  const darkTheme = `
    html {
      filter: none !important;
    }
    body {
      background-color: #2b2d30 !important;
      color: #c8c5be !important;
    }
    * {
      border-color: #3e4042 !important;
      scrollbar-color: #4a4c50 #2b2d30;
      box-shadow: none !important;
      text-shadow: none !important;
    }
    a { color: #8aab8a !important; }
    a:visited { color: #a89880 !important; }
    div, section, article, aside, header, footer, nav, main,
    p, span, li, ul, ol, table, tr, td, th, pre, code, blockquote,
    h1, h2, h3, h4, h5, h6, label, legend, fieldset, details, summary {
      background-color: transparent !important;
      color: #c8c5be !important;
    }
    input, textarea, select, button {
      background-color: #363839 !important;
      color: #c8c5be !important;
      border-color: #4a4c50 !important;
    }
    img, video, canvas, svg {
      filter: brightness(0.88) saturate(0.9) !important;
    }
    iframe {
      filter: none !important;
    }
    ::selection {
      background-color: #4a5a4a !important;
      color: #e0ddd6 !important;
    }
    code, pre {
      background-color: #333538 !important;
      color: #b8c4a8 !important;
    }
  `;

  const themes = {
    off: { label: '🌙', css: '', next: 'light', title: '当前：默认 → 点击切换亮色' },
    light: { label: '☀️', css: lightTheme, next: 'dark', title: '当前：亮色 → 点击切换暗色' },
    dark: { label: '🌿', css: darkTheme, next: 'off', title: '当前：暗色 → 点击恢复默认' },
  };

  let current = GM_getValue(STORAGE_KEY, 'off');

  function applyTheme(mode) {
    current = mode;
    GM_setValue(STORAGE_KEY, mode);

    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    styleEl.textContent = themes[mode].css;

    const btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.textContent = themes[mode].label;
      btn.title = themes[mode].title;
    }
  }

  // 页面加载时立即注入样式，减少闪烁
  if (themes[current].css) {
    const earlyStyle = document.createElement('style');
    earlyStyle.id = STYLE_ID;
    earlyStyle.textContent = themes[current].css;
    (document.head || document.documentElement).appendChild(earlyStyle);
  }

  function createToggleButton() {
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.textContent = themes[current].label;
    btn.title = themes[current].title;
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      zIndex: '2147483647',
      width: '42px',
      height: '42px',
      lineHeight: '42px',
      textAlign: 'center',
      fontSize: '20px',
      borderRadius: '50%',
      cursor: 'pointer',
      userSelect: 'none',
      backgroundColor: 'rgba(80, 80, 80, 0.6)',
      backdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,255,255,0.15)',
      transition: 'opacity 0.2s, transform 0.2s',
      opacity: '1.00',
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1.1)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.opacity = '0.8';
      btn.style.transform = 'scale(1)';
    });
    btn.addEventListener('click', () => {
      applyTheme(themes[current].next);
    });

    document.body.appendChild(btn);
  }

  if (document.body) {
    createToggleButton();
  } else {
    document.addEventListener('DOMContentLoaded', createToggleButton);
  }

  GM_registerMenuCommand('切换主题', () => {
    applyTheme(themes[current].next);
  });
})();

