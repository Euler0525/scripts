// ==UserScript==
// @name         Region Checker (IP Geo)
// @namespace    http://tampermonkey.net/
// @version      0.1.1
// @description
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      ip-api.com
// @connect      ipinfo.io
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // --- UI ---
  const container = document.createElement('div');
  container.id = 'region-checker-float';
  container.innerHTML = `
    <div class="rc-title">🌍 Region Checker</div>
    <div class="rc-row"><span class="rc-label">国家:</span><span id="rc-ip-geo">检测中...</span></div>
    <div class="rc-row"><span class="rc-label">城市:</span><span id="rc-city">检测中...</span></div>
    <div class="rc-row"><span class="rc-label">ISP:</span><span id="rc-isp">检测中...</span></div>
    <div class="rc-footer">点击刷新</div>
  `;
  document.body.appendChild(container);

  GM_addStyle(`
    #region-checker-float {
      position: fixed;
      bottom: 20px;
      left: 20px;
      z-index: 2147483647;
      background: rgba(225, 225, 225, 0.9);
      color: #151515;
      border-radius: 10px;
      padding: 12px 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      box-shadow: 0 4px 20px rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(8px);
      cursor: pointer;
      user-select: none;
      min-width: 180px;
      transition: opacity 0.2s;
    }
    #region-checker-float:hover {
      opacity: 0.85;
    }
    #region-checker-float .rc-title {
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 6px;
      color: #000;
    }
    #region-checker-float .rc-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    #region-checker-float .rc-label {
      color: #000;
      flex-shrink: 0;
    }
    #region-checker-float .rc-footer {
      text-align: center;
      font-size: 11px;
      color: #000;
      margin-top: 6px;
    }
  `);

  const ipGeoEl = document.getElementById('rc-ip-geo');
  const cityEl = document.getElementById('rc-city');
  const ispEl = document.getElementById('rc-isp');

  const regionNames = {
    'CN': '中国大陆', 'HK': '中国香港', 'TW': '中国台湾', 'MO': '中国澳门',
    'US': '美国', 'JP': '日本', 'KR': '韩国', 'SG': '新加坡',
    'GB': '英国', 'DE': '德国', 'FR': '法国', 'AU': '澳大利亚',
    'CA': '加拿大', 'IN': '印度', 'RU': '俄罗斯', 'BR': '巴西',
    'IT': '意大利', 'ES': '西班牙', 'NL': '荷兰', 'SE': '瑞典',
    'CH': '瑞士', 'TH': '泰国', 'VN': '越南', 'MY': '马来西亚',
    'PH': '菲律宾', 'ID': '印度尼西亚', 'TR': '土耳其', 'MX': '墨西哥',
    'AE': '阿联酋', 'SA': '沙特阿拉伯', 'NZ': '新西兰', 'IE': '爱尔兰',
    'PL': '波兰', 'NO': '挪威', 'DK': '丹麦', 'FI': '芬兰',
    'AT': '奥地利', 'BE': '比利时', 'PT': '葡萄牙', 'CZ': '捷克',
    'IL': '以色列', 'ZA': '南非', 'AR': '阿根廷', 'CL': '智利',
    'CO': '哥伦比亚', 'EG': '埃及', 'PK': '巴基斯坦', 'UA': '乌克兰',
  };

  function formatRegion(code, extra) {
    if (!code) return '未知';
    const name = regionNames[code.toUpperCase()] || code.toUpperCase();
    return extra ? `${name} (${code.toUpperCase()}) ${extra}` : `${name} (${code.toUpperCase()})`;
  }

  // --- IP Geolocation (precise to city) ---
  function checkIPGeo() {
    ipGeoEl.textContent = '检测中...';
    cityEl.textContent = '检测中...';
    ispEl.textContent = '检测中...';

    GM_xmlhttpRequest({
      method: 'GET',
      url: 'http://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query',
      anonymous: true,
      onload: function (res) {
        try {
          const data = JSON.parse(res.responseText);
          if (data.status === 'success') {
            const countryName = regionNames[data.countryCode] || data.country;
            ipGeoEl.textContent = `${countryName} (${data.countryCode})`;
            ipGeoEl.style.color = '#4caf50';

            // City + Region (province/state)
            const cityInfo = [data.city, data.regionName].filter(Boolean).join(', ');
            cityEl.textContent = cityInfo || '未知';
            cityEl.title = `IP: ${data.query} | 坐标: ${data.lat}, ${data.lon} | 时区: ${data.timezone} | 邮编: ${data.zip}`;
            cityEl.style.color = '#4caf50';

            // ISP info
            const ispInfo = data.isp || data.org || data.as || '未知';
            ispEl.textContent = ispInfo.length > 24 ? ispInfo.substring(0, 22) + '…' : ispInfo;
            ispEl.title = `ISP: ${data.isp}\nOrg: ${data.org}\nAS: ${data.as}`;
            ispEl.style.color = '#4caf50';
          } else {
            ipGeoEl.textContent = `失败: ${data.message}`;
            ipGeoEl.style.color = '#f44336';
            cityEl.textContent = '-';
            ispEl.textContent = '-';
          }
        } catch (e) {
          ipGeoEl.textContent = '解析失败';
          ipGeoEl.style.color = '#f44336';
          cityEl.textContent = '-';
          ispEl.textContent = '-';
        }
      },
      onerror: function () {
        ipGeoEl.textContent = '请求失败';
        ipGeoEl.style.color = '#f44336';
        cityEl.textContent = '-';
        ispEl.textContent = '-';
        // Fallback to ipinfo.io
        checkIPGeoFallback();
      },
      ontimeout: function () {
        ipGeoEl.textContent = '超时';
        ipGeoEl.style.color = '#f44336';
        cityEl.textContent = '-';
        ispEl.textContent = '-';
      },
      timeout: 8000,
    });
  }

  // --- Fallback: ipinfo.io ---
  function checkIPGeoFallback() {
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://ipinfo.io/json',
      anonymous: true,
      onload: function (res) {
        try {
          const data = JSON.parse(res.responseText);
          const countryName = regionNames[data.country] || data.country;
          ipGeoEl.textContent = `${countryName} (${data.country})`;
          ipGeoEl.style.color = '#4caf50';

          const cityInfo = [data.city, data.region].filter(Boolean).join(', ');
          cityEl.textContent = cityInfo || '未知';
          cityEl.title = `IP: ${data.ip} | 坐标: ${data.loc} | 时区: ${data.timezone}`;
          cityEl.style.color = '#4caf50';

          ispEl.textContent = data.org || '未知';
          ispEl.style.color = '#666';
        } catch (e) {
          ipGeoEl.textContent = '备用源失败';
          ipGeoEl.style.color = '#f44336';
        }
      },
      onerror: function () {
        ipGeoEl.textContent = '所有源失败';
        ipGeoEl.style.color = '#f44336';
      },
      timeout: 8000,
    });
  }

  // --- Refresh ---
  function runChecks() {
    checkIPGeo();
  }

  container.addEventListener('click', runChecks);
  runChecks();
})();

