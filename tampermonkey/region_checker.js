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
// @connect      speed.cloudflare.com
// @connect      test.nju.edu.cn
// @connect      librespeed.a573.net
// @connect      speedtest.cesnet.cz
// @connect      laxspeed.sharktech.net
// @run-at       document-idle
// @noframes
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

// --- Add-on: fresh, bounded HTTPS speed measurements; original checks above are unchanged. ---
(function () {
  'use strict';

  const panel = document.getElementById('region-checker-float');
  if (!panel) return;
  const footer = panel.querySelector('.rc-footer');
  const MiB = 1024 * 1024;
  const limits = {
    probeTimeout: 2500,
    requestTimeout: 10000,
    totalTimeout: 45000,
    directionTime: 6000,
    downloadBytes: 16 * MiB,
    uploadBytes: 8 * MiB,
  };

  // Independent providers reduce regional outages; no public endpoint can promise
  // availability in every country. Only purpose-built, free speed-test APIs are used.
  // API references: https://github.com/cloudflare/speedtest
  // https://librespeed.org/backend-servers/servers.php
  // NJU service: https://doc.nju.edu.cn/books/07cdf/page/6ea2e
  function libreSpeed(name, origin) {
    return {
      name,
      ping: `${origin}/backend/empty.php`,
      download: bytes => `${origin}/backend/garbage.php?ckSize=${bytes / MiB}`,
      upload: `${origin}/backend/empty.php`,
      chunk: MiB,
    };
  }

  const servers = [
    {
      name: 'Cloudflare',
      ping: 'https://speed.cloudflare.com/__down?bytes=0',
      download: bytes => `https://speed.cloudflare.com/__down?bytes=${bytes}`,
      upload: 'https://speed.cloudflare.com/__up',
      chunk: 256 * 1024,
    },
    libreSpeed('南京大学', 'https://test.nju.edu.cn'),
    libreSpeed('LibreSpeed · 东京', 'https://librespeed.a573.net'),
    libreSpeed('CESNET · 布拉格', 'https://speedtest.cesnet.cz'),
    libreSpeed('Sharktech · 洛杉矶', 'https://laxspeed.sharktech.net'),
  ];

  function addRow(label, id) {
    const row = document.createElement('div');
    row.className = 'rc-row';
    const caption = document.createElement('span');
    caption.className = 'rc-label';
    caption.textContent = label;
    const value = document.createElement('span');
    value.id = id;
    row.append(caption, value);
    panel.insertBefore(row, footer);
    return value;
  }

  const downloadEl = addRow('下行:', 'rc-download');
  const uploadEl = addRow('上行:', 'rc-upload');
  const latencyEl = addRow('HTTP 延迟:', 'rc-latency');
  const serverEl = addRow('测速节点:', 'rc-speed-server');
  // Reuse the original refresh footer for progress and the combined refresh action.
  const statusEl = footer;
  statusEl.id = 'rc-speed-status';
  statusEl.style.cssText = 'white-space:nowrap;';
  statusEl.title = '每次页面加载或点击面板重新实测；每轮最多下载 16 MiB、上传 8 MiB 测试数据（协议开销另计）。\n速度为到所选节点的单连接 HTTP 吞吐量估计，含请求往返和脚本通信开销，可能低于线路峰值；代理、节点负载及其他流量都会影响结果。\nHTTP 延迟为连接预热后的多次空载请求往返时间中位数，包含服务端及扩展处理时间，并非 ICMP Ping。';

  let current = null;
  let nonce = 0;

  function active(job) {
    return current === job && !job.cancelled;
  }

  const resultColors = { pending: '#151515', success: '#4caf50', error: '#f44336' };

  function paint(element, value, state = 'pending') {
    element.textContent = value;
    element.style.color = resultColors[state];
  }

  function cancel(job) {
    if (!job) return;
    job.cancelled = true;
    clearTimeout(job.timer);
    for (const abort of [...job.requests]) abort();
  }

  // An independent watchdog also covers managers where anonymous/fetch mode
  // ignores GM_xmlhttpRequest's timeout. Never rely on progress events for timing.
  function request(job, url, method = 'GET', data, timeout = limits.requestTimeout) {
    return new Promise((resolve, reject) => {
      if (!active(job)) return reject(new Error('已取消'));
      let handle;
      let settled = false;
      let watchdog;
      const started = performance.now();
      function finish(error, response) {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        job.requests.delete(abort);
        if (error) reject(error);
        else resolve({ response, ms: Math.max(1, performance.now() - started) });
      }
      function abort() {
        finish(new Error('已取消'));
        stopRequest();
      }
      function stopRequest() {
        try { handle?.abort(); } catch (_) { /* Some managers throw after completion. */ }
      }
      job.requests.add(abort);
      watchdog = setTimeout(() => {
        finish(new Error('请求超时'));
        stopRequest();
      }, timeout);
      const freshURL = new URL(url);
      freshURL.searchParams.set('rc_nocache', `${Date.now()}-${++nonce}`);
      try {
        handle = GM_xmlhttpRequest({
          method,
          url: freshURL.href,
          data,
          anonymous: true,
          nocache: true,
          responseType: 'arraybuffer',
          headers: method === 'POST' ? { 'Content-Type': 'application/octet-stream' } : {},
          timeout,
          onload(response) {
            if (settled) return;
            // Reject login portals, blocked-page redirects and HTTP errors.
            try {
              const destination = new URL(response.finalUrl || freshURL.href);
              if (response.status < 200 || response.status >= 300 ||
                destination.origin !== freshURL.origin || destination.pathname !== freshURL.pathname) {
                finish(new Error(`节点响应异常 (HTTP ${response.status})`));
              } else {
                finish(null, response);
              }
            } catch (error) {
              finish(error);
            }
          },
          onerror: () => finish(new Error('网络错误')),
          ontimeout: () => finish(new Error('请求超时')),
          onabort: () => finish(new Error('已取消')),
        });
      } catch (error) {
        finish(error);
      }
    });
  }

  async function ping(job, server) {
    const result = await request(job, server.ping, 'GET', undefined, limits.probeTimeout);
    if (result.response.response?.byteLength !== 0) throw new Error('延迟端点返回了非空内容');
    return result.ms;
  }

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  async function probe(job, server) {
    await ping(job, server); // Exclude initial DNS/TCP/TLS setup from idle latency.
    const samples = [];
    for (let i = 0; i < 3; i++) samples.push(await ping(job, server));
    return { server, latency: median(samples) };
  }

  function randomPayload(bytes) {
    const buffer = new Uint8Array(bytes);
    for (let offset = 0; offset < bytes; offset += 65536) {
      crypto.getRandomValues(buffer.subarray(offset, Math.min(bytes, offset + 65536)));
    }
    return new Blob([buffer], { type: 'application/octet-stream' });
  }

  async function measure(job, server, direction) {
    const download = direction === 'download';
    const element = download ? downloadEl : uploadEl;
    const budget = download ? 'downloadRemaining' : 'uploadRemaining';
    const chunk = download ? server.chunk : 64 * 1024;
    let bytes = chunk;
    let totalBytes = 0;
    let totalMs = 0;
    let count = 0;
    const started = performance.now();
    while (active(job) && job[budget] >= chunk && count < 4 &&
      performance.now() - started < limits.directionTime) {
      bytes = Math.min(bytes, Math.floor(job[budget] / chunk) * chunk);
      // Reserve bytes before sending, including failed attempts and fallback nodes.
      job[budget] -= bytes;
      const payload = download ? undefined : randomPayload(bytes);
      const result = await request(job, download ? server.download(bytes) : server.upload,
        download ? 'GET' : 'POST', payload);
      if (!active(job)) throw new Error('已取消');
      const response = result.response;
      const actualBytes = response.response?.byteLength;
      if (download) {
        const headers = response.responseHeaders || '';
        if (actualBytes !== bytes || !/^content-type:\s*application\/octet-stream\b/im.test(headers)) {
          throw new Error('下载内容异常，拒绝将拦截页或截断响应计为网速');
        }
      } else if (server.chunk === MiB && actualBytes !== 0) {
        throw new Error('上传端点响应异常');
      } else if (/^content-type:\s*(?:text\/html|application\/xhtml\+xml)\b/im.test(response.responseHeaders || '') && actualBytes > 0) {
        throw new Error('上传端点返回了网页');
      }
      totalBytes += bytes;
      totalMs += result.ms;
      count++;
      const mbps = totalBytes * 8 / (totalMs * 1000);
      paint(element, `≈ ${mbps.toFixed(2)} Mbps`, 'success');
      element.title = `${(mbps / 8).toFixed(2)} MB/s；${count} 个已完成样本，合计 ${(totalBytes / MiB).toFixed(2)} MiB / ${(totalMs / 1000).toFixed(2)} s。\n${statusEl.title}`;
      if (count >= 2 && totalMs >= 1800) break;
      // Adapt to the measured path, with a maximum 4 MiB per request.
      bytes = Math.max(chunk, Math.min(4 * MiB, Math.ceil(bytes * 1400 / result.ms / chunk) * chunk));
    }
    if (!count) throw new Error('本轮测速流量额度已用完');
  }

  async function runSpeedCheck() {
    cancel(current);
    const job = {
      cancelled: false,
      requests: new Set(),
      downloadRemaining: limits.downloadBytes,
      uploadRemaining: limits.uploadBytes,
    };
    current = job;
    paint(downloadEl, '等待测速...');
    paint(uploadEl, '等待测速...');
    paint(latencyEl, '检测中...');
    paint(serverEl, '选择可用节点...');
    downloadEl.removeAttribute('title');
    uploadEl.removeAttribute('title');
    serverEl.removeAttribute('title');
    paint(statusEl, '探测节点中 · 点击刷新');
    job.timer = setTimeout(() => {
      if (!active(job)) return;
      paint(statusEl, '测速超时 · 点击刷新', 'error');
      for (const element of [downloadEl, uploadEl, latencyEl, serverEl]) {
        if (/等待|检测|测速中|选择/.test(element.textContent)) paint(element, '超时', 'error');
      }
      cancel(job);
    }, limits.totalTimeout);

    try {
      // Probe independently: unavailable providers do not prevent trying others.
      const results = await Promise.allSettled(servers.map(server => probe(job, server)));
      if (!active(job)) return;
      const candidates = results.filter(result => result.status === 'fulfilled')
        .map(result => result.value).sort((a, b) => a.latency - b.latency);
      const errors = [];
      for (const { server, latency } of candidates) {
        if (!active(job)) return;
        paint(serverEl, server.name, 'success');
        serverEl.title = `下载: ${server.download(server.chunk)}\n上传: ${server.upload}`;
        paint(latencyEl, `${latency.toFixed(0)} ms`, 'success');
        paint(downloadEl, '测速中...');
        paint(uploadEl, '等待测速...');
        downloadEl.removeAttribute('title');
        uploadEl.removeAttribute('title');
        try {
          paint(statusEl, '下行测速中 · 点击刷新');
          await measure(job, server, 'download');
          paint(uploadEl, '测速中...');
          paint(statusEl, '上行测速中 · 点击刷新');
          await measure(job, server, 'upload');
          if (active(job)) {
            paint(statusEl, '点击刷新 / 重新测速', 'success');
          }
          return;
        } catch (error) {
          if (!active(job)) return;
          errors.push(`${server.name}: ${error.message}`);
          paint(statusEl, '切换节点中 · 点击刷新');
        }
      }
      if (!active(job)) return;
      paint(downloadEl, '不可用', 'error');
      paint(uploadEl, '不可用', 'error');
      if (!candidates.length) {
        paint(latencyEl, '不可用', 'error');
        paint(serverEl, '无可用节点', 'error');
      }
      paint(statusEl, '测速不可用 · 点击刷新', 'error');
      serverEl.title = errors.length ? errors.join('\n') : results.map((result, index) =>
        `${servers[index].name}: ${result.reason?.message || '不可达'}`).join('\n');
    } catch (error) {
      if (active(job)) {
        paint(statusEl, '测速失败 · 点击刷新', 'error');
        serverEl.title = error.message;
      }
    } finally {
      clearTimeout(job.timer);
    }
  }

  panel.addEventListener('click', runSpeedCheck);
  window.addEventListener('pagehide', () => cancel(current));
  runSpeedCheck();
})();

