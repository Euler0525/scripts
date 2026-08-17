// ==UserScript==
// @name         央视网视频下载
// @namespace    https://tv.cctv.com/
// @version      1.0.0
// @description  全局选择最高分辨率和最高码率，下载并封装为 MP4，支持剧集批量下载
// @author       Euler0525
// @match        https://tv.cctv.com/*
// @match        http://tv.cctv.com/*
// @match        https://tv.cctv.cn/*
// @match        http://tv.cctv.cn/*
// @require      https://cdn.jsdelivr.net/npm/mux.js@7.1.0/dist/mux.min.js
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const DOWNLOAD_CONCURRENCY = 6;
    const activeRequests = new Set();
    const resolvedVideos = new Map();
    let currentVideo;
    let stopped = false;

    const panel = document.createElement('div');
    panel.style.cssText = [
        'position:fixed',
        'right:20px',
        'top:90px',
        'z-index:2147483647',
        'width:320px',
        'max-height:calc(100vh - 120px)',
        'overflow:auto',
        'padding:14px',
        'border-radius:10px',
        'background:rgba(20,20,24,.95)',
        'box-shadow:0 6px 24px rgba(0,0,0,.38)',
        'color:#fff',
        'font:14px/1.5 system-ui,sans-serif'
    ].join(';');

    panel.innerHTML = `
        <div style="font-weight:700;font-size:16px;margin-bottom:8px">央视视频下载</div>
        <div id="cctv-hq-status" style="color:#ddd;word-break:break-word">正在解析当前视频……</div>
        <div style="display:grid;gap:8px;margin-top:12px">
            <button id="cctv-hq-download" disabled>下载当前视频</button>
            <button id="cctv-hq-stop" hidden>停止任务</button>
        </div>
        <div id="cctv-hq-collection" hidden style="margin-top:14px;border-top:1px solid #555;padding-top:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <strong id="cctv-hq-count"></strong>
                <span>
                    <button id="cctv-hq-all" style="padding:3px 7px">全选</button>
                    <button id="cctv-hq-none" style="padding:3px 7px">全不选</button>
                </span>
            </div>
            <div id="cctv-hq-episodes" style="max-height:230px;overflow:auto;border:1px solid #555;border-radius:6px;padding:6px"></div>
            <button id="cctv-hq-batch" style="width:100%;margin-top:8px" disabled>批量下载已选剧集</button>
        </div>`;

    document.body.appendChild(panel);

    const status = panel.querySelector('#cctv-hq-status');
    const downloadButton = panel.querySelector('#cctv-hq-download');
    const stopButton = panel.querySelector('#cctv-hq-stop');
    const collectionBox = panel.querySelector('#cctv-hq-collection');
    const collectionCount = panel.querySelector('#cctv-hq-count');
    const episodeBox = panel.querySelector('#cctv-hq-episodes');
    const batchButton = panel.querySelector('#cctv-hq-batch');
    const allButton = panel.querySelector('#cctv-hq-all');
    const noneButton = panel.querySelector('#cctv-hq-none');

    for (const button of panel.querySelectorAll('button')) {
        button.style.cssText += ';padding:8px;border:0;border-radius:6px;cursor:pointer;font-weight:600';
    }

    function setStatus(text) {
        status.textContent = text;
    }

    function setBusy(busy) {
        downloadButton.disabled = busy || !currentVideo;
        batchButton.disabled = busy || !getSelectedEpisodes().length;
        stopButton.hidden = !busy;
        stopButton.disabled = false;
    }

    function findGuidInText(text) {
        return text.match(/(?:guid|videoCenterId)\s*=\s*["']([0-9a-f]{32})["']/i)?.[1]
            || text.match(/[?&]pid=([0-9a-f]{32})/i)?.[1];
    }

    function findCurrentGuid() {
        for (const candidate of [unsafeWindow.guid, unsafeWindow.videoCenterId]) {
            const match = String(candidate || '').match(/[0-9a-f]{32}/i);
            if (match) return match[0];
        }
        return findGuidInText(Array.from(document.scripts, script => script.textContent || '').join('\n'));
    }

    function request(url, responseType = 'text') {
        return new Promise((resolve, reject) => {
            if (stopped) {
                reject(new Error('任务已停止'));
                return;
            }

            const xhr = GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType,
                timeout: 30000,
                onload(response) {
                    activeRequests.delete(xhr);
                    if (response.status >= 200 && response.status < 300) {
                        resolve(responseType === 'arraybuffer' ? response.response : response.responseText);
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror() {
                    activeRequests.delete(xhr);
                    reject(new Error('网络请求失败'));
                },
                ontimeout() {
                    activeRequests.delete(xhr);
                    reject(new Error('网络请求超时'));
                },
                onabort() {
                    activeRequests.delete(xhr);
                    reject(new Error('任务已停止'));
                }
            });
            activeRequests.add(xhr);
        });
    }

    async function requestWithRetry(url, responseType = 'text') {
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                return await request(url, responseType);
            } catch (error) {
                if (stopped) throw error;
                lastError = error;
            }
        }
        throw lastError;
    }

    function stopTask() {
        stopped = true;
        for (const xhr of activeRequests) xhr.abort();
        activeRequests.clear();
        stopButton.disabled = true;
    }

    function parseAttributes(line) {
        const attributes = {};
        for (const match of line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi)) {
            attributes[match[1].toUpperCase()] = match[2].replace(/^"|"$/g, '');
        }
        return attributes;
    }

    function parseMasterPlaylist(text, masterUrl) {
        const lines = text.split(/\r?\n/).map(line => line.trim());
        const variants = [];

        for (let index = 0; index < lines.length; index++) {
            if (!lines[index].startsWith('#EXT-X-STREAM-INF:')) continue;

            const attributes = parseAttributes(lines[index]);
            let uri = '';
            while (++index < lines.length) {
                if (lines[index] && !lines[index].startsWith('#')) {
                    uri = lines[index];
                    break;
                }
            }
            if (!uri) continue;

            const [width = 0, height = 0] = (attributes.RESOLUTION || '').split('x').map(Number);
            variants.push({
                url: new URL(uri, masterUrl).href,
                bandwidth: Number(attributes.BANDWIDTH) || 0,
                width,
                height,
                codecs: attributes.CODECS || ''
            });
        }

        return variants.length
            ? variants
            : [{ url: masterUrl, bandwidth: 0, width: 0, height: 0, codecs: '' }];
    }

    function compareVariants(a, b) {
        return (b.width * b.height - a.width * a.height) || (b.bandwidth - a.bandwidth);
    }

    function createClearHlsCandidates(variantUrl, clearHosts) {
        const source = new URL(variantUrl);
        const clearPath = source.pathname.replace(
            /^\/asp\/(?:h5e|enc2?)\/hls\//i,
            '/asp/hls/'
        );
        if (!/^\/asp\/hls\//i.test(clearPath)) return [];

        return clearHosts.map(host => {
            const clearUrl = new URL(source.href);
            clearUrl.protocol = 'https:';
            clearUrl.host = host;
            clearUrl.pathname = clearPath;
            clearUrl.search = '';
            clearUrl.hash = '';
            return clearUrl.href;
        });
    }

    function parseMediaPlaylist(text, mediaUrl) {
        if (/#EXT-X-STREAM-INF:/i.test(text)) return null;
        if (/^#EXT-X-KEY:(?![^\n]*METHOD=NONE)/mi.test(text)) return null;
        if (/^#EXT-X-(?:BYTERANGE|MAP):/mi.test(text)) return null;

        const segments = text
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(uri => new URL(uri, mediaUrl).href);

        return segments.length ? segments : null;
    }

    function qualityText(video) {
        const resolution = video.width && video.height ? `${video.width}×${video.height}` : '原始画质';
        const bitrate = video.bandwidth ? ` · ${(video.bandwidth / 1e6).toFixed(2)} Mbps` : '';
        return resolution + bitrate;
    }

    function safeFilename(name) {
        return name
            .replace(/\s*[-_]?\s*(?:CCTV节目官网|央视网).*$/i, '')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/[. ]+$/g, '')
            .slice(0, 150) || 'CCTV视频';
    }

    function formatBytes(bytes) {
        if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    }

    async function resolveVideo(guid, title) {
        if (resolvedVideos.has(guid)) return resolvedVideos.get(guid);

        const promise = (async () => {
            const apiUrl = `https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=${encodeURIComponent(guid)}&client=flash&im=0`;
            const info = JSON.parse(await requestWithRetry(apiUrl));
            if (info.ack !== 'yes') throw new Error('央视接口没有返回可用的视频信息');
            if (String(info.is_protected) === '1') throw new Error('该视频受到保护，脚本不会绕过保护');

            const sourceUrls = new Set();
            if (info.hls_url) sourceUrls.add(info.hls_url);
            for (const [key, value] of Object.entries(info.manifest || {})) {
                if (!/audio/i.test(key) && typeof value === 'string' && /\.m3u8(?:\?|$)/i.test(value)) {
                    sourceUrls.add(value);
                }
            }
            if (!sourceUrls.size) throw new Error('没有找到 HLS 播放列表');

            const masterResults = await Promise.allSettled(Array.from(sourceUrls, async sourceUrl => {
                const text = await requestWithRetry(sourceUrl);
                return parseMasterPlaylist(text, sourceUrl);
            }));

            const discoveredVariants = masterResults
                .filter(result => result.status === 'fulfilled')
                .flatMap(result => result.value)
                .filter((variant, index, all) => all.findIndex(item => item.url === variant.url) === index);

            const clearHosts = ['hls.cntv.lxdns.com'];
            try {
                const apiHlsHost = new URL(info.hls_url).host;
                if (!clearHosts.includes(apiHlsHost)) clearHosts.unshift(apiHlsHost);
            } catch (error) { }

            const variants = discoveredVariants
                .flatMap(variant => createClearHlsCandidates(variant.url, clearHosts).map(url => ({ ...variant, url })))
                .filter((variant, index, all) => all.findIndex(item => item.url === variant.url) === index)
                .sort(compareVariants);

            for (const variant of variants) {
                try {
                    const mediaText = await requestWithRetry(variant.url);
                    const segments = parseMediaPlaylist(mediaText, variant.url);
                    if (segments) {
                        return {
                            ...variant,
                            guid,
                            title: safeFilename(title || info.title || document.title),
                            segments
                        };
                    }
                } catch (error) {
                    if (stopped) throw error;
                }
            }

            throw new Error('没有找到可无损封装的公开 TS 码流');
        })();

        resolvedVideos.set(guid, promise);
        try {
            return await promise;
        } catch (error) {
            resolvedVideos.delete(guid);
            throw error;
        }
    }

    async function resolveEpisode(episode) {
        const html = await requestWithRetry(episode.url);
        const guid = findGuidInText(html);
        if (!guid) throw new Error('剧集页面中没有找到 GUID');
        return resolveVideo(guid, episode.title);
    }

    function transmuxSegment(transmuxer, arrayBuffer) {
        const outputs = [];
        transmuxer.on('data', segment => outputs.push(segment));
        try {
            transmuxer.push(new Uint8Array(arrayBuffer));
            transmuxer.flush();
        } finally {
            transmuxer.off('data');
        }
        if (!outputs.length) throw new Error('TS 分片无法封装为 MP4，编码格式可能不受支持');
        return outputs;
    }

    async function writeVideoAsMp4(video, writer, progressPrefix) {
        if (!globalThis.muxjs?.mp4?.Transmuxer) throw new Error('MP4 转封装组件加载失败');

        const transmuxer = new muxjs.mp4.Transmuxer({ remux: true });
        let initWritten = false;
        let downloadedBytes = 0;

        for (let start = 0; start < video.segments.length; start += DOWNLOAD_CONCURRENCY) {
            if (stopped) throw new Error('任务已停止');
            const urls = video.segments.slice(start, start + DOWNLOAD_CONCURRENCY);
            const results = await Promise.allSettled(urls.map(url => requestWithRetry(url, 'arraybuffer')));
            const failed = results.find(result => result.status === 'rejected');
            if (failed) throw failed.reason;
            const buffers = results.map(result => result.value);

            for (const buffer of buffers) {
                for (const output of transmuxSegment(transmuxer, buffer)) {
                    if (!initWritten) {
                        await writer.write(output.initSegment);
                        initWritten = true;
                    }
                    await writer.write(output.data);
                }
                downloadedBytes += buffer.byteLength;
                const completed = Math.min(start + buffers.indexOf(buffer) + 1, video.segments.length);
                setStatus(`${progressPrefix} · ${completed}/${video.segments.length} · ${formatBytes(downloadedBytes)}`);
            }
        }

        if (!initWritten) throw new Error('没有生成有效的 MP4 数据');
        return downloadedBytes;
    }

    async function downloadSingle() {
        const showSaveFilePicker = unsafeWindow.showSaveFilePicker || window.showSaveFilePicker;
        if (!showSaveFilePicker) throw new Error('请使用支持流式保存的 Chrome 或 Edge');

        stopped = false;
        const fileHandle = await showSaveFilePicker.call(unsafeWindow, {
            suggestedName: `${currentVideo.title}.mp4`,
            types: [{ description: 'MP4 视频', accept: { 'video/mp4': ['.mp4'] } }]
        });
        const writer = await fileHandle.createWritable();
        setBusy(true);

        try {
            const bytes = await writeVideoAsMp4(currentVideo, writer, `正在下载 ${qualityText(currentVideo)}`);
            await writer.close();
            setStatus(`下载完成 · ${qualityText(currentVideo)} · ${formatBytes(bytes)}`);
            GM_notification({ title: '央视视频下载完成', text: `${currentVideo.title}.mp4`, timeout: 5000 });
        } catch (error) {
            await writer.abort().catch(() => { });
            if (stopped) setStatus('任务已停止，未完成的 MP4 已放弃写入');
            else throw error;
        } finally {
            setBusy(false);
        }
    }

    async function createUniqueFile(directoryHandle, baseName) {
        for (let index = 1; index <= 999; index++) {
            const suffix = index === 1 ? '' : ` (${index})`;
            const name = `${safeFilename(baseName)}${suffix}.mp4`;
            try {
                await directoryHandle.getFileHandle(name);
            } catch (error) {
                if (error?.name === 'NotFoundError') {
                    return { name, handle: await directoryHandle.getFileHandle(name, { create: true }) };
                }
                throw error;
            }
        }
        throw new Error('目标文件夹中同名文件过多');
    }

    function getSelectedEpisodes() {
        return Array.from(episodeBox.querySelectorAll('input[type="checkbox"]:checked'), input => ({
            url: input.dataset.url,
            title: input.dataset.title,
            row: input.closest('label')
        }));
    }

    async function downloadBatch() {
        const showDirectoryPicker = unsafeWindow.showDirectoryPicker || window.showDirectoryPicker;
        if (!showDirectoryPicker) throw new Error('批量下载需要 Chrome 或 Edge 的文件夹保存功能');

        const episodes = getSelectedEpisodes();
        if (!episodes.length) throw new Error('请至少选择一集');

        stopped = false;
        const directoryHandle = await showDirectoryPicker.call(unsafeWindow, { mode: 'readwrite' });
        setBusy(true);
        let succeeded = 0;
        const failures = [];

        try {
            for (let index = 0; index < episodes.length; index++) {
                if (stopped) break;
                const episode = episodes[index];
                const marker = episode.row.querySelector('.cctv-hq-result');
                marker.textContent = '解析中';

                try {
                    setStatus(`正在解析 ${index + 1}/${episodes.length} · ${episode.title}`);
                    const video = await resolveEpisode(episode);
                    marker.textContent = qualityText(video);
                    const file = await createUniqueFile(directoryHandle, video.title);
                    const writer = await file.handle.createWritable();

                    try {
                        const bytes = await writeVideoAsMp4(
                            video,
                            writer,
                            `第 ${index + 1}/${episodes.length} 个 · ${video.title} · ${qualityText(video)}`
                        );
                        await writer.close();
                        marker.textContent = `完成 · ${formatBytes(bytes)}`;
                        succeeded++;
                    } catch (error) {
                        await writer.abort().catch(() => { });
                        throw error;
                    }
                } catch (error) {
                    if (stopped) break;
                    marker.textContent = `失败 · ${error.message}`;
                    failures.push(`${episode.title}：${error.message}`);
                }
            }

            if (stopped) {
                setStatus(`批量任务已停止 · 已完成 ${succeeded}/${episodes.length}`);
            } else {
                setStatus(`批量下载结束 · 成功 ${succeeded}/${episodes.length}${failures.length ? ` · 失败 ${failures.length}` : ''}`);
                GM_notification({
                    title: '央视合集下载结束',
                    text: `成功 ${succeeded}，失败 ${failures.length}`,
                    timeout: 6000
                });
            }
        } finally {
            setBusy(false);
        }
    }

    function extractEpisodes() {
        const byUrl = new Map();
        for (const link of document.querySelectorAll('a[href*="/VID"]')) {
            const title = (link.getAttribute('title') || link.innerText || '').trim().replace(/\s+/g, ' ');
            if (!/第\s*\d+\s*集/.test(title)) continue;

            const url = new URL(link.href, location.href);
            url.search = '';
            url.hash = '';
            if (!/\/VID[^/]*\.shtml$/i.test(url.pathname)) continue;

            const existing = byUrl.get(url.href);
            if (!existing || title.length > existing.title.length) byUrl.set(url.href, { url: url.href, title });
        }

        return Array.from(byUrl.values()).sort((a, b) => {
            const aNumber = Number(a.title.match(/第\s*(\d+)\s*集/)?.[1]) || 0;
            const bNumber = Number(b.title.match(/第\s*(\d+)\s*集/)?.[1]) || 0;
            return aNumber - bNumber;
        });
    }

    function renderEpisodes(episodes) {
        if (!episodes.length) return;
        collectionBox.hidden = false;
        collectionCount.textContent = `检测到 ${episodes.length} 集`;
        episodeBox.innerHTML = '';

        for (const episode of episodes) {
            const label = document.createElement('label');
            label.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:7px;padding:5px 2px;border-bottom:1px solid #444;cursor:pointer';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = true;
            input.dataset.url = episode.url;
            input.dataset.title = episode.title;

            const textBox = document.createElement('span');
            const title = document.createElement('span');
            title.textContent = episode.title;
            const result = document.createElement('small');
            result.className = 'cctv-hq-result';
            result.style.cssText = 'display:block;color:#9fc7ff';
            textBox.append(title, result);
            label.append(input, textBox);
            episodeBox.appendChild(label);
        }

        batchButton.disabled = false;
    }

    downloadButton.addEventListener('click', () => {
        downloadSingle().catch(error => {
            if (error?.name !== 'AbortError') setStatus(`错误：${error.message}`);
        });
    });

    batchButton.addEventListener('click', () => {
        downloadBatch().catch(error => {
            if (error?.name !== 'AbortError') setStatus(`错误：${error.message}`);
            setBusy(false);
        });
    });

    stopButton.addEventListener('click', stopTask);
    allButton.addEventListener('click', () => {
        for (const input of episodeBox.querySelectorAll('input[type="checkbox"]')) input.checked = true;
        batchButton.disabled = false;
    });
    noneButton.addEventListener('click', () => {
        for (const input of episodeBox.querySelectorAll('input[type="checkbox"]')) input.checked = false;
        batchButton.disabled = true;
    });
    episodeBox.addEventListener('change', () => {
        batchButton.disabled = !getSelectedEpisodes().length;
    });

    (async () => {
        renderEpisodes(extractEpisodes());
        try {
            stopped = false;
            const guid = findCurrentGuid();
            if (!guid) throw new Error('没有在当前页面找到视频 GUID');
            currentVideo = await resolveVideo(guid, document.title);
            setStatus(`最高可下载画质 · ${qualityText(currentVideo)}`);
            setBusy(false);
        } catch (error) {
            setStatus(`当前视频解析失败：${error.message}`);
        }
    })();
})();

