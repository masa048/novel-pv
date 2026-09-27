/**
 * 小説家になろう & カクヨム PVモニタ アプリケーションロジック
 */

(function () {
  'use strict';

  // 状態管理
  const state = {
    selectedDate: typeof TODAY_ISO !== 'undefined' ? TODAY_ISO : getTodayIsoString(),
    selectedNcode: null,
    activeTab: 'daily-table', // 'daily-table' | 'cumulative-table' | 'history-table'
    dailyHistoryRange: '30', // '30' | '90' | 'all' (なろう日別推移の表示期間)
    theme: localStorage.getItem('novel_pv_theme') || 'light',
  };

  // 日別PV履歴 期間別サブセット取得
  function getDailyHistorySubset(dailyHistory, rangeMode) {
    if (!dailyHistory || !dailyHistory.length) return [];
    if (rangeMode === '7') return dailyHistory.slice(-7);
    if (rangeMode === '30') return dailyHistory.slice(-30);
    if (rangeMode === '90') return dailyHistory.slice(-90);
    return dailyHistory;
  }

  // 日別PV履歴 期間説明ラベル
  function getDailyRangeDesc(dailyHistory, rangeMode) {
    if (!dailyHistory || !dailyHistory.length) return '';
    const totalDays = dailyHistory.length;
    const startStr = dailyHistory[0].d;

    if (totalDays <= 7) {
      if (rangeMode === 'all') {
        return `連載開始(${startStr})〜現在（全${totalDays}日間・全体トレンド折れ線）`;
      }
      return `連載開始(${startStr})から${totalDays}日目のため、全${totalDays}日分を表示中（棒グラフ）`;
    }

    if (rangeMode === '7') {
      return `直近7日間の推移（棒グラフ）`;
    }
    if (rangeMode === '30') {
      return totalDays <= 30
        ? `連載開始(${startStr})〜現在（全${totalDays}日間・棒グラフ）`
        : `直近30日間の推移（棒グラフ）`;
    }
    if (rangeMode === '90') {
      return totalDays <= 90
        ? `連載開始(${startStr})〜現在（全${totalDays}日間・棒グラフ）`
        : `直近90日間の推移（棒グラフ）`;
    }
    return `連載開始(${startStr})〜現在（全${totalDays}日間・全体トレンド折れ線）`;
  }

  // ユーティリティ
  function getTodayIsoString() {
    const d = new Date();
    const jstOffset = 9 * 60;
    const jstDate = new Date(d.getTime() + (jstOffset + d.getTimezoneOffset()) * 60000);
    return jstDate.toISOString().split('T')[0];
  }

  function formatDisplayDate(isoStr) {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length !== 3) return isoStr;
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日 (${dow})`;
  }

  // 連載開始日関連ユーティリティ
  function formatStartDate(isoStr) {
    if (!isoStr) return '-';
    const parts = isoStr.split('-');
    if (parts.length !== 3) return isoStr;
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }

  function formatStartDateShort(isoStr) {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length !== 3) return isoStr;
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  }

  // 指定日までの経過日数を算出（連載開始当日を1日目とする）
  function getDaysElapsed(startDateStr, targetDateStr = state.selectedDate) {
    if (!startDateStr) return null;
    const [sy, sm, sd] = startDateStr.split('-').map(Number);
    const [ty, tm, td] = targetDateStr.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const target = new Date(ty, tm - 1, td);
    const diffMs = target.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diffDays);
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  // テーマの初期適用
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? '☀️ 明色モード' : '🌙 墨色モード';
    }
    localStorage.setItem('novel_pv_theme', theme);
  }

  // 作品から特定の日付のPVを取得するヘルパー
  function getBookPvOnDate(book, isoDate) {
    if (!book) return { naro: 0, kaku: 0, total: 0 };
    
    // なろうの日別値
    let naroPv = 0;
    if (isoDate === TODAY_ISO && book.narou && book.narou.todayPv !== undefined) {
      naroPv = book.narou.todayPv;
    } else if (book.narou && book.narou.dailyHistory) {
      const match = book.narou.dailyHistory.find(h => h.date === isoDate);
      if (match) naroPv = match.pv;
    }

    // カクヨムの日別値
    let kakuPv = 0;
    if (isoDate === TODAY_ISO && book.kakuyomu && book.kakuyomu.todayPv !== undefined) {
      kakuPv = book.kakuyomu.todayPv;
    } else if (book.kakuyomu && book.kakuyomu.dailyHistory) {
      const match = book.kakuyomu.dailyHistory.find(h => h.date === isoDate);
      if (match) kakuPv = match.pv;
    }

    return {
      naro: naroPv,
      kaku: kakuPv,
      total: naroPv + kakuPv,
    };
  }

  // なろう累計PV
  function getNaroCumulative(book) {
    if (book.narou && book.narou.cumulativePv !== undefined) return book.narou.cumulativePv;
    if (book.narou && book.narou.dailyHistory) return sum(book.narou.dailyHistory.map(h => h.pv));
    return 0;
  }

  // カクヨム累計PV
  function getKakuCumulative(book) {
    return (book.kakuyomu && book.kakuyomu.totalPv) ? book.kakuyomu.totalPv : 0;
  }

  // ヒートマップ用の色補間 (優しいグリーン系パレット)
  function getHeatColor(ratio) {
    // 淡い若草 -> 萌黄色 -> 常盤緑 -> 深い千歳緑
    const stops = [
      { p: 0.0, c: [222, 240, 226] }, // #DEF0E2
      { p: 0.35, c: [172, 222, 183] }, // #ACDEB7
      { p: 0.7, c: [78, 174, 110] },  // #4EAE6E
      { p: 1.0, c: [32, 98, 56] },    // #206238
    ];
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (ratio >= stops[i].p && ratio <= stops[i + 1].p) {
        lo = stops[i];
        hi = stops[i + 1];
        break;
      }
    }
    const span = (hi.p - lo.p) || 1;
    const t = Math.max(0, Math.min(1, (ratio - lo.p) / span));
    const rgb = lo.c.map((v, idx) => Math.round(v + (hi.c[idx] - v) * t));
    const textDark = ratio > 0.65 ? '#FFF' : '#1C2D21';
    return { bg: `rgb(${rgb.join(',')})`, color: textDark };
  }

  // ============================================================
  // レンダリング: 全体KPIサマリー
  // ============================================================
  function renderKpiSummary() {
    let selectedDateNaroTotal = 0;
    let selectedDateKakuTotal = 0;
    let grandNaroCumulative = 0;
    let grandKakuCumulative = 0;
    let maxPvBook = null;
    let maxPvVal = -1;

    BOOKS.forEach(b => {
      const pv = getBookPvOnDate(b, state.selectedDate);
      selectedDateNaroTotal += pv.naro;
      selectedDateKakuTotal += pv.kaku;

      grandNaroCumulative += getNaroCumulative(b);
      grandKakuCumulative += getKakuCumulative(b);

      if (pv.total > maxPvVal) {
        maxPvVal = pv.total;
        maxPvBook = b;
      }
    });

    const selectedDateTotal = selectedDateNaroTotal + selectedDateKakuTotal;
    const grandCumulative = grandNaroCumulative + grandKakuCumulative;

    // DOM更新
    const isToday = state.selectedDate === TODAY_ISO;
    const dateLabel = isToday ? '本日' : formatDisplayDate(state.selectedDate).slice(5);

    document.getElementById('kpiDateTotalTitle').textContent = `${dateLabel}の総閲覧数 (PV)`;
    document.getElementById('kpiDateTotalVal').textContent = selectedDateTotal.toLocaleString();
    document.getElementById('kpiDateNaroSub').textContent = `なろう: ${selectedDateNaroTotal.toLocaleString()} PV`;
    document.getElementById('kpiDateKakuSub').textContent = `カクヨム: ${selectedDateKakuTotal.toLocaleString()} PV`;

    document.getElementById('kpiCumulTotalVal').textContent = grandCumulative.toLocaleString();
    document.getElementById('kpiCumulNaroSub').textContent = `なろう: ${grandNaroCumulative.toLocaleString()} PV`;
    document.getElementById('kpiCumulKakuSub').textContent = `カクヨム: ${grandKakuCumulative.toLocaleString()} PV`;

    document.getElementById('kpiWorksCountVal').textContent = BOOKS.length;
    
    if (maxPvBook) {
      document.getElementById('kpiTopBookTitle').textContent = maxPvBook.shortTitle;
      document.getElementById('kpiTopBookPv').textContent = `${maxPvVal.toLocaleString()} PV`;
    }
  }

  // ============================================================
  // レンダリング: 日付コントロール
  // ============================================================
  function renderDateToolbar() {
    const isToday = state.selectedDate === TODAY_ISO;
    const statusEl = document.getElementById('selectedDateStatus');
    statusEl.innerHTML = `📅 <b>${formatDisplayDate(state.selectedDate)}</b> の集計を表示中`;

    const todayBtn = document.getElementById('btnDateToday');
    const yesterdayBtn = document.getElementById('btnDateYesterday');

    const yesterdayIso = getRelativeDateIso(TODAY_ISO, -1);

    todayBtn.classList.toggle('active', state.selectedDate === TODAY_ISO);
    yesterdayBtn.classList.toggle('active', state.selectedDate === yesterdayIso);

    const picker = document.getElementById('datePicker');
    if (picker) {
      picker.value = state.selectedDate;
    }
  }

  function getRelativeDateIso(baseIso, offsetDays) {
    const [y, m, d] = baseIso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + offsetDays);
    const ny = date.getFullYear();
    const nm = String(date.getMonth() + 1).padStart(2, '0');
    const nd = String(date.getDate()).padStart(2, '0');
    return `${ny}-${nm}-${nd}`;
  }

  // ============================================================
  // レンダリング: 作品クイックセレクター (スクロール不要・書影なし)
  // ============================================================
  function renderWorkSelector() {
    const grid = document.getElementById('workSelectorGrid');
    if (!grid) return;
    grid.innerHTML = '';

    BOOKS.forEach((b, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `selector-btn ${b.ncode === state.selectedNcode ? 'active' : ''}`;
      btn.dataset.ncode = b.ncode;
      btn.setAttribute('aria-label', b.title);

      const pv = getBookPvOnDate(b, state.selectedDate);
      const cumul = getNaroCumulative(b) + getKakuCumulative(b);
      const statusText = b.status === 'done' ? '完結' : '連載中';
      const statusCls = b.status === 'done' ? 'done' : 'ongoing';

      const isToday = state.selectedDate === TODAY_ISO;
      const dateLabel = isToday ? '本日' : formatDisplayDate(state.selectedDate).slice(5);
      const epCount = b.episodes || 0;
      const startShort = formatStartDateShort(b.startDate);

      btn.innerHTML = `
        <div class="selector-btn-top">
          <span class="selector-order">${b.order || idx + 1}</span>
          <span class="selector-status ${statusCls}">${statusText}</span>
          ${epCount > 0 ? `<span class="selector-episodes">全${epCount}話</span>` : ''}
          ${startShort ? `<span class="selector-start-date">${startShort}〜</span>` : ''}
          ${b.hot ? `<span class="badge hot" style="padding:2px 7px;font-size:12px;font-weight:700;">急上昇</span>` : ''}
          <span style="font-size:12px;color:var(--text-dim);margin-left:auto;font-weight:500;">${b.genre || ''}</span>
        </div>
        <div class="selector-title">${b.shortTitle}</div>
        <div class="selector-meta">
          <span>${dateLabel}: <b>${pv.total.toLocaleString()}</b> PV</span>
          <span>累計: <b>${cumul.toLocaleString()}</b> PV</span>
        </div>
      `;

      btn.addEventListener('click', () => {
        selectBook(b.ncode);
      });

      grid.appendChild(btn);
    });
  }

  function selectBook(ncode) {
    state.selectedNcode = ncode;
    
    // セレクターボタンのアクティブ切り替え
    const btns = document.querySelectorAll('.selector-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.dataset.ncode === ncode);
    });

    renderDetailPanel();
  }

  // ============================================================
  // レンダリング: 作品詳細パネル (Detail Panel - ここで書影画像を表示！)
  // ============================================================
  function renderDetailPanel() {
    const wrap = document.getElementById('detailPanel');
    const b = BOOKS.find(x => x.ncode === state.selectedNcode) || BOOKS[0];
    if (!b) {
      wrap.innerHTML = '<p>作品が選択されていません。</p>';
      return;
    }

    const pv = getBookPvOnDate(b, state.selectedDate);
    const naroCumul = getNaroCumulative(b);
    const kakuCumul = getKakuCumulative(b);
    const totalCumul = naroCumul + kakuCumul;

    const isToday = state.selectedDate === TODAY_ISO;
    const dateLabel = isToday ? '本日' : formatDisplayDate(state.selectedDate).slice(5);
    const daysElapsed = getDaysElapsed(b.startDate, state.selectedDate);
    const epCount = b.episodes || 0;
    const avgDailyPv = daysElapsed > 0 ? Math.round(totalCumul / daysElapsed) : null;

    // 書影画像のHTML
    const coverHtml = b.cover ? `
      <div class="detail-cover-wrap">
        <img class="detail-cover-img" src="${b.cover}" alt="${b.shortTitle}">
      </div>
    ` : '';

    wrap.innerHTML = `
      <div class="detail-header">
        ${coverHtml}
        <div class="detail-title-area">
          <h3>${b.title}</h3>
          ${b.mood ? `<div class="detail-mood">${b.mood}</div>` : ''}
          <div class="detail-tags">
            ${(b.tags || []).map(t => `<span class="tag">#${t}</span>`).join('')}
            ${b.genre ? `<span class="tag" style="color:var(--green-deep);font-weight:700;">${b.genre}</span>` : ''}
            <span class="tag" style="color:var(--gold);font-weight:700;">${b.status === 'done' ? '完結済み' : '連載中'}</span>
            ${b.startDate ? `<span class="tag tag-highlight" title="連載開始日と経過日数">📅 連載開始: ${formatStartDate(b.startDate)} (${daysElapsed}日目)</span>` : ''}
            ${epCount > 0 ? `<span class="tag tag-episodes" title="全公開話数">📖 公開話数: 全${epCount}話</span>` : ''}
            ${avgDailyPv !== null ? `<span class="tag tag-highlight" title="全期間累計PV ÷ 連載日数">⚡ 累計日速: ${avgDailyPv.toLocaleString()} PV/日</span>` : ''}
          </div>
          <div class="detail-links">
            <a href="https://ncode.syosetu.com/${b.ncode}/" target="_blank" rel="noopener noreferrer" class="ext-link narou">
              📖 小説家になろうで読む (${b.ncode.toUpperCase()})
            </a>
            ${b.kakuyomu && b.kakuyomu.workId ? `
            <a href="https://kakuyomu.jp/works/${b.kakuyomu.workId}" target="_blank" rel="noopener noreferrer" class="ext-link kakuyomu">
              📘 カクヨムで読む (${b.kakuyomu.workId})
            </a>` : ''}
          </div>
        </div>
      </div>

      <!-- プラットフォーム別 対比メトリクス -->
      <div class="platform-comparison-grid">
        <!-- 小説家になろう -->
        <div class="platform-box narou-box">
          <div class="platform-box-head">
            <span class="platform-title narou">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--narou-color);"></span>
              小説家になろう
            </span>
            <span style="font-size:12.5px;color:var(--text-dim);font-weight:500;">Nコード: ${b.ncode}</span>
          </div>
          <div class="platform-metrics-row">
            <div class="metric-item">
              <span class="m-label">${dateLabel}のPV</span>
              <span class="m-value highlight-rose">${pv.naro.toLocaleString()}<span class="m-unit">PV</span></span>
            </div>
            <div class="metric-item">
              <span class="m-label">全期間 累計PV</span>
              <span class="m-value">${naroCumul.toLocaleString()}<span class="m-unit">PV</span></span>
            </div>
            <div class="metric-item">
              <span class="m-label">初回掲載日</span>
              <span class="m-value" style="font-size:16px;padding-top:4px;">${b.narou?.startDate ? formatStartDate(b.narou.startDate) : (b.startDate ? formatStartDate(b.startDate) : '-')}</span>
            </div>
            <div class="metric-item">
              <span class="m-label">公開話数</span>
              <span class="m-value">${b.narou?.episodes ? b.narou.episodes + '<span class="m-unit">話</span>' : (epCount ? epCount + '<span class="m-unit">話</span>' : '-')}</span>
            </div>
            <div class="metric-item">
              <span class="m-label">累計ユニーク</span>
              <span class="m-value">${b.narou && b.narou.unique ? b.narou.unique.toLocaleString() : '-'}<span class="m-unit">人</span></span>
            </div>
            <div class="metric-item">
              <span class="m-label">ブックマーク</span>
              <span class="m-value highlight-gold">${b.narou && b.narou.stats ? b.narou.stats.bookmarks.toLocaleString() : '-'}<span class="m-unit">件</span></span>
            </div>
            <div class="metric-item">
              <span class="m-label">総合評価pt</span>
              <span class="m-value">${b.narou && b.narou.stats ? b.narou.stats.globalPoint.toLocaleString() : '-'}<span class="m-unit">pt</span></span>
            </div>
            <div class="metric-item">
              <span class="m-label">評価平均</span>
              <span class="m-value">${b.narou && b.narou.stats && b.narou.stats.ratingAvg ? b.narou.stats.ratingAvg : '-'}<span class="m-unit">点</span></span>
            </div>
          </div>
        </div>

        <!-- カクヨム -->
        <div class="platform-box kakuyomu-box">
          <div class="platform-box-head">
            <span class="platform-title kakuyomu">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--kakuyomu-color);"></span>
              カクヨム
            </span>
            <span style="font-size:12.5px;color:var(--text-dim);font-weight:500;">${b.kakuyomu ? '作品ID: ' + b.kakuyomu.workId : ''}</span>
          </div>
          <div class="platform-metrics-row">
            <div class="metric-item">
              <span class="m-label">${dateLabel}のPV</span>
              <span class="m-value highlight-rose">${pv.kaku.toLocaleString()}<span class="m-unit">PV</span></span>
            </div>
            <div class="metric-item">
              <span class="m-label">全期間 累計PV</span>
              <span class="m-value">${kakuCumul.toLocaleString()}<span class="m-unit">PV</span></span>
            </div>
            <div class="metric-item">
              <span class="m-label">連載開始日</span>
              <span class="m-value" style="font-size:16px;padding-top:4px;">${b.kakuyomu?.startDate ? formatStartDate(b.kakuyomu.startDate) : (b.kakuyomu?.periodStart ? formatStartDate(b.kakuyomu.periodStart) : '-')}</span>
            </div>
            <div class="metric-item">
              <span class="m-label">公開話数</span>
              <span class="m-value">${b.kakuyomu?.episodes?.length ? b.kakuyomu.episodes.length + '<span class="m-unit">話</span>' : (epCount ? epCount + '<span class="m-unit">話</span>' : '-')}</span>
            </div>
            <div class="metric-item">
              <span class="m-label">フォロワー数</span>
              <span class="m-value highlight-gold">${b.kakuyomu && b.kakuyomu.followers ? b.kakuyomu.followers.toLocaleString() : '-'}<span class="m-unit">人</span></span>
            </div>
            <div class="metric-item">
              <span class="m-label">応援数 (Cheer)</span>
              <span class="m-value">${b.kakuyomu && b.kakuyomu.cheers ? b.kakuyomu.cheers.toLocaleString() : '-'}<span class="m-unit">回</span></span>
            </div>
            <div class="metric-item">
              <span class="m-label">レビュー評価</span>
              <span class="m-value highlight-gold">★ ${(b.kakuyomu?.reviewPoints ?? 0).toLocaleString()} <span class="m-unit" style="font-size:12.5px;color:var(--text-sub);font-weight:600;">/ ${(b.kakuyomu?.reviewCount || 0).toLocaleString()}人</span></span>
            </div>
            <div class="metric-item">
              <span class="m-label">コメント数</span>
              <span class="m-value">${b.kakuyomu && b.kakuyomu.comments ? b.kakuyomu.comments.toLocaleString() : '0'}<span class="m-unit">件</span></span>
            </div>
          </div>
        </div>
      </div>

      <!-- グラフ群 -->
      <div class="chart-grid">
        <!-- なろう 時間帯別PV (24時間) -->
        <div class="chart-card">
          <div class="chart-head">
            <span class="chart-title">🕒 時間帯別PV推移 (なろう・0〜23時)</span>
            <div class="chart-legend">
              <span><span class="legend-swatch" style="background:var(--rose-deep);"></span>本日 ${b.narou?.hourly?.todayDate || ''}</span>
              <span><span class="legend-swatch" style="background:var(--lilac);opacity:0.8;"></span>昨日 ${b.narou?.hourly?.yesterdayDate || ''}</span>
            </div>
          </div>
          ${renderHourlySvg(b.narou?.hourly)}
        </div>

        <!-- なろう 流入デバイス比率 -->
        <div class="chart-card">
          <div class="chart-head">
            <span class="chart-title">📱 デバイス構成比 (なろう)</span>
          </div>
          ${renderDonutSvg(b.narou?.pc || 0, b.narou?.sp || 0, b.narou?.app || 0)}
        </div>
      </div>

      <!-- カクヨム 話数別累計PV (読了カーブ) -->
      ${b.kakuyomu && b.kakuyomu.episodes && b.kakuyomu.episodes.length ? `
      <div class="wide-chart-card">
        <div class="chart-head">
          <span class="chart-title">📈 カクヨム 話数別 累計PV（読了定着カーブ・全${b.kakuyomu.episodes.length}話）</span>
          <span style="font-size:12.5px;color:var(--text-sub);">第1話〜最新話までの読者推移</span>
        </div>
        ${renderRetentionSvg(b.kakuyomu.episodes, 'var(--kakuyomu-color)')}
      </div>` : ''}

      <!-- なろう 日別PV推移 (期間切り替え対応) -->
      ${b.narou && b.narou.dailyHistory && b.narou.dailyHistory.length ? `
      <div class="wide-chart-card" id="narouDailyCard">
        <div class="chart-head" style="align-items:center;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="chart-title">📅 なろう 日別PV推移</span>
            <span class="chart-sub-label" id="narouDailyDesc" style="font-size:12.5px;color:var(--text-sub);font-weight:500;">
              ${getDailyRangeDesc(b.narou.dailyHistory, state.dailyHistoryRange)}
            </span>
          </div>
          <div class="chart-tab-group" id="dailyRangeTabs" role="group" aria-label="日別PVの表示期間">
            <button type="button" class="chart-tab-btn ${state.dailyHistoryRange === '7' ? 'active' : ''}" data-range="7">直近7日</button>
            <button type="button" class="chart-tab-btn ${state.dailyHistoryRange === '30' ? 'active' : ''}" data-range="30">直近30日</button>
            <button type="button" class="chart-tab-btn ${state.dailyHistoryRange === '90' ? 'active' : ''}" data-range="90">直近90日</button>
            <button type="button" class="chart-tab-btn ${state.dailyHistoryRange === 'all' ? 'active' : ''}" data-range="all">全期間</button>
          </div>
        </div>
        <div id="narouDailySvgWrap">
          ${renderDailyHistorySvg(b.narou.dailyHistory, state.dailyHistoryRange)}
        </div>
      </div>` : ''}

      <!-- ランキング履歴 -->
      ${b.rankHistory && b.rankHistory.length ? `
      <div class="wide-chart-card">
        <div class="chart-head">
          <span class="chart-title">🏆 ランキング履歴（自動検知・上位300位以内）</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;padding-right:6px;">
          ${b.rankHistory.map(h => `
            <div style="display:grid;grid-template-columns:90px 1fr 70px 24px;gap:10px;align-items:center;padding:8px 10px;background:var(--bg-color);border-radius:var(--radius-sm);font-size:12.5px;">
              <span style="color:var(--text-dim);font-family:var(--font-serif);">${h.date}</span>
              <span style="font-weight:600;color:var(--plum);">${h.label} ${h.note ? `<span style="font-size:12px;color:var(--text-dim);margin-left:4px;">${h.note}</span>` : ''}</span>
              <span style="font-weight:700;color:var(--rose-deep);text-align:right;">${h.rank}位</span>
              <span style="text-align:center;">${h.source === 'auto' ? '🤖' : '✍️'}</span>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    `;

    // チャートのマウスオーバー・インタラクション設定
    setupChartInteractions(b);
  }

  // ============================================================
  // インタラクティブ・チャート ツールチップ制御
  // ============================================================
  function getTooltipEl() {
    return document.getElementById('chartTooltip');
  }

  function showChartTooltip(clientX, clientY, html) {
    const tip = getTooltipEl();
    if (!tip) return;
    tip.innerHTML = html;
    tip.style.display = 'block';

    const tRect = tip.getBoundingClientRect();
    const w = tRect.width || 180;
    const h = tRect.height || 70;

    let left = clientX;
    let top = clientY - 14;
    let transY = '-100%';

    // 画面左右のはみ出し補正
    const pad = 12;
    if (left - w / 2 < pad) {
      left = pad + w / 2;
    } else if (left + w / 2 > window.innerWidth - pad) {
      left = window.innerWidth - pad - w / 2;
    }

    // 画面上部のはみ出し補正（上に入らない場合は下へ）
    if (clientY - h - 20 < pad) {
      top = clientY + 20;
      transY = '0%';
    }

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.transform = `translate(-50%, ${transY})`;
    tip.classList.add('active');
  }

  function hideChartTooltip() {
    const tip = getTooltipEl();
    if (!tip) return;
    tip.classList.remove('active');
    tip.style.display = 'none';
  }

  // ============================================================
  // SVG チャート描画関数群 (インタラクティブ対応)
  // ============================================================
  function renderHourlySvg(hourly) {
    if (!hourly || !hourly.today || !hourly.today.length) {
      return '<div style="text-align:center;padding:40px;color:var(--text-dim);font-size:12px;">時間帯別データがありません</div>';
    }
    const todayData = hourly.today;
    const yestData = hourly.yesterday;
    const maxVal = Math.max(...todayData, ...yestData, 1);

    const w = 600, h = 160;
    const padL = 30, padR = 15, padT = 15, padB = 25;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    function getPoints(data) {
      return data.map((v, i) => {
        const x = padL + (i / 23) * plotW;
        const y = padT + plotH - (v / maxVal) * plotH;
        return `${x},${y}`;
      }).join(' ');
    }

    const yestPts = getPoints(yestData);
    const todayPts = getPoints(todayData);

    // 時間軸ラベル (0, 6, 12, 18, 23時)
    const axisLabels = [0, 6, 12, 18, 23].map(hour => {
      const x = padL + (hour / 23) * plotW;
      return `<text x="${x}" y="${h - 6}" font-size="12" font-weight="600" fill="var(--text-dim)" text-anchor="middle">${hour}時</text>`;
    }).join('');

    return `
      <div class="interactive-chart-wrap" id="hourlyChartWrap">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="svg-chart" id="hourlySvg">
          <!-- 全域マウス検知用透明ヒットエリア -->
          <rect x="0" y="0" width="${w}" height="${h}" fill="transparent" pointer-events="all" style="cursor:crosshair;" />

          <!-- グリッド線 -->
          <line x1="${padL}" y1="${padT + plotH * 0.5}" x2="${w - padR}" y2="${padT + plotH * 0.5}" stroke="var(--line-soft)" stroke-dasharray="3,3" />
          <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="var(--line-soft)" />

          <!-- 昨日ライン -->
          <polyline points="${yestPts}" fill="none" stroke="var(--lilac)" stroke-width="2" opacity="0.65" stroke-dasharray="4,2" />
          
          <!-- 本日ライン -->
          <polyline points="${todayPts}" fill="none" stroke="var(--rose-deep)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
          
          <!-- データポイント (本日) -->
          ${todayData.map((v, i) => {
            if (v === 0) return '';
            const x = padL + (i / 23) * plotW;
            const y = padT + plotH - (v / maxVal) * plotH;
            return `<circle cx="${x}" cy="${y}" r="3" fill="var(--rose-deep)"></circle>`;
          }).join('')}

          ${axisLabels}

          <!-- マウスオーバー・ガイド線とハイライトポイント -->
          <g class="hourly-hover-group" style="display:none;pointer-events:none;">
            <line class="hourly-v-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="var(--forest)" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.85" />
            <circle class="hourly-yest-pt" cx="0" cy="0" r="4.5" fill="var(--lilac)" stroke="#FFF" stroke-width="1.5" />
            <circle class="hourly-today-pt" cx="0" cy="0" r="5.5" fill="var(--rose-deep)" stroke="#FFF" stroke-width="2" />
          </g>
        </svg>
      </div>
    `;
  }

  function renderDonutSvg(pc, sp, app) {
    const total = pc + sp + app;
    if (total === 0) {
      return '<div style="text-align:center;padding:40px;color:var(--text-dim);font-size:12px;">データなし</div>';
    }
    const pcPct = Math.round((pc / total) * 100);
    const spPct = Math.round((sp / total) * 100);
    const appPct = 100 - pcPct - spPct;

    const r = 42;
    const c = 2 * Math.PI * r;

    const pcLen = (pcPct / 100) * c;
    const spLen = (spPct / 100) * c;
    const appLen = (appPct / 100) * c;

    const pcOffset = 0;
    const spOffset = -pcLen;
    const appOffset = -(pcLen + spLen);

    return `
      <div class="donut-container" id="donutChartContainer">
        <svg width="110" height="110" viewBox="0 0 100 100" style="transform: rotate(-90deg);overflow:visible;">
          <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--bg-color)" stroke-width="16" />
          <!-- PC (濃い青) -->
          <circle class="donut-slice" data-name="パソコン (PC)" data-pct="${pcPct}" data-pv="${pc}" data-color="var(--device-pc)"
            cx="50" cy="50" r="${r}" fill="none" stroke="var(--device-pc)" stroke-width="16"
            stroke-dasharray="${pcLen} ${c - pcLen}" stroke-dashoffset="${pcOffset}" style="cursor:pointer;" />
          <!-- SP (薄い青) -->
          <circle class="donut-slice" data-name="スマートフォン" data-pct="${spPct}" data-pv="${sp}" data-color="var(--device-sp)"
            cx="50" cy="50" r="${r}" fill="none" stroke="var(--device-sp)" stroke-width="16"
            stroke-dasharray="${spLen} ${c - spLen}" stroke-dashoffset="${spOffset}" style="cursor:pointer;" />
          <!-- 公式アプリ (薄いグリーン) -->
          <circle class="donut-slice" data-name="公式アプリ" data-pct="${appPct}" data-pv="${app}" data-color="var(--device-app)"
            cx="50" cy="50" r="${r}" fill="none" stroke="var(--device-app)" stroke-width="16"
            stroke-dasharray="${appLen} ${c - appLen}" stroke-dashoffset="${appOffset}" style="cursor:pointer;" />
        </svg>

        <div class="donut-legend-list">
          <div class="donut-legend-item" data-name="パソコン (PC)" data-pct="${pcPct}" data-pv="${pc}" data-color="var(--device-pc)" style="cursor:pointer;">
            <span><span class="donut-dot" style="background:var(--device-pc);"></span>パソコン (PC)</span>
            <b>${pcPct}% <span style="font-weight:normal;font-size:12px;color:var(--text-dim);">(${pc.toLocaleString()}PV)</span></b>
          </div>
          <div class="donut-legend-item" data-name="スマートフォン" data-pct="${spPct}" data-pv="${sp}" data-color="var(--device-sp)" style="cursor:pointer;">
            <span><span class="donut-dot" style="background:var(--device-sp);"></span>スマートフォン</span>
            <b>${spPct}% <span style="font-weight:normal;font-size:12px;color:var(--text-dim);">(${sp.toLocaleString()}PV)</span></b>
          </div>
          <div class="donut-legend-item" data-name="公式アプリ" data-pct="${appPct}" data-pv="${app}" data-color="var(--device-app)" style="cursor:pointer;">
            <span><span class="donut-dot" style="background:var(--device-app);"></span>公式アプリ</span>
            <b>${appPct}% <span style="font-weight:normal;font-size:12px;color:var(--text-dim);">(${app.toLocaleString()}PV)</span></b>
          </div>
        </div>
      </div>
    `;
  }

  function renderRetentionSvg(episodes, strokeColor) {
    if (!episodes || !episodes.length) return '';
    const maxVal = Math.max(...episodes, 1);
    const n = episodes.length;
    const w = 700, h = 140;
    const padL = 35, padR = 20, padT = 15, padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const pts = episodes.map((v, i) => {
      const x = padL + (i / Math.max(1, n - 1)) * plotW;
      const y = padT + plotH - (v / maxVal) * plotH;
      return `${x},${y}`;
    }).join(' ');

    const areaPts = `${padL},${padT + plotH} ${pts} ${padL + plotW},${padT + plotH}`;

    return `
      <div class="interactive-chart-wrap" id="retentionChartWrap">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="svg-chart" id="retentionSvg">
          <defs>
            <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.3" />
              <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0" />
            </linearGradient>
          </defs>
          <!-- 全域マウス検知用透明ヒットエリア -->
          <rect x="0" y="0" width="${w}" height="${h}" fill="transparent" pointer-events="all" style="cursor:crosshair;" />

          <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="var(--line-soft)" />
          <polygon points="${areaPts}" fill="url(#retGrad)" />
          <polyline points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linejoin="round" />
          <text x="${padL}" y="${h - 5}" font-size="12" font-weight="600" fill="var(--text-dim)">第1話 (${episodes[0].toLocaleString()}PV)</text>
          <text x="${w - padR}" y="${h - 5}" font-size="12" font-weight="600" fill="var(--text-dim)" text-anchor="end">最新 ${n}話 (${episodes[n - 1].toLocaleString()}PV)</text>

          <!-- マウスオーバー・ガイド線とハイライトポイント -->
          <g class="retention-hover-group" style="display:none;pointer-events:none;">
            <line class="retention-v-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.85" />
            <circle class="retention-pt" cx="0" cy="0" r="5.5" fill="${strokeColor}" stroke="#FFF" stroke-width="2" />
          </g>
        </svg>
      </div>
    `;
  }

  function renderDailyHistorySvg(dailyHistory, rangeMode = '30') {
    if (!dailyHistory || !dailyHistory.length) return '';
    const subset = getDailyHistorySubset(dailyHistory, rangeMode);
    const n = subset.length;
    if (n === 0) return '';

    const maxVal = Math.max(...subset.map(d => d.pv), 1);
    const w = 700, h = 140;
    const padL = 35, padR = 20, padT = 15, padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const isAreaMode = (rangeMode === 'all');

    let chartContent = '';
    let hoverElements = '';

    if (!isAreaMode) {
      // --- 棒グラフモード (直近30日 / 90日) ---
      const barW = Math.max(2, (plotW / n) * 0.7);
      const bars = subset.map((d, i) => {
        const x = padL + (i / n) * plotW;
        const barH = (d.pv / maxVal) * plotH;
        const y = padT + plotH - barH;
        const isSelected = d.date === state.selectedDate;
        const fillColor = isSelected ? 'var(--rose-deep)' : 'var(--lilac)';
        return `<rect class="daily-bar" data-idx="${i}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="1" fill="${fillColor}" opacity="${isSelected ? '1' : '0.82'}"></rect>`;
      }).join('');

      chartContent = bars;
      hoverElements = `
        <rect class="daily-highlight-bar" x="0" y="0" width="${barW.toFixed(1)}" height="0" rx="1" fill="var(--rose-deep)" stroke="#FFF" stroke-width="1.5" style="display:none;pointer-events:none;" />
      `;
    } else {
      // --- エリアチャートモード (全期間: 何年経っても破綻しない滑らかな推移曲線) ---
      const pts = subset.map((d, i) => {
        const x = padL + (i / Math.max(1, n - 1)) * plotW;
        const y = padT + plotH - (d.pv / maxVal) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');

      const areaPts = `${padL},${padT + plotH} ${pts} ${padL + plotW},${padT + plotH}`;

      const dots = (n <= 60) ? subset.map((d, i) => {
        const x = padL + (i / Math.max(1, n - 1)) * plotW;
        const y = padT + plotH - (d.pv / maxVal) * plotH;
        const isSelected = d.date === state.selectedDate;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isSelected ? '4.5' : '2.5'}" fill="${isSelected ? 'var(--rose-deep)' : '#FFFFFF'}" stroke="var(--rose-deep)" stroke-width="1.8" />`;
      }).join('') : '';

      chartContent = `
        <defs>
          <linearGradient id="narouDailyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--rose-deep)" stop-opacity="0.38" />
            <stop offset="100%" stop-color="var(--rose-deep)" stop-opacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points="${areaPts}" fill="url(#narouDailyGrad)" />
        <polyline points="${pts}" fill="none" stroke="var(--rose-deep)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        ${dots}
      `;

      hoverElements = `
        <g class="daily-hover-group" style="display:none;pointer-events:none;">
          <line class="daily-v-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="var(--rose-deep)" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.85" />
          <circle class="daily-hover-pt" cx="0" cy="0" r="5" fill="var(--rose-deep)" stroke="#FFF" stroke-width="2" />
        </g>
      `;
    }

    // 中間日ラベル (十分な日数がある場合に中央にも表示)
    const midIdx = Math.floor(n / 2);
    const midLabel = (n >= 14 && subset[midIdx])
      ? `<text x="${padL + plotW / 2}" y="${h - 5}" font-size="12" font-weight="600" fill="var(--text-dim)" text-anchor="middle">${subset[midIdx].d}</text>`
      : '';

    return `
      <div class="interactive-chart-wrap" id="dailyHistoryChartWrap" data-range="${rangeMode}">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="svg-chart" id="dailyHistorySvg">
          <!-- 全域マウス検知用透明ヒットエリア -->
          <rect x="0" y="0" width="${w}" height="${h}" fill="transparent" pointer-events="all" style="cursor:crosshair;" />

          <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="var(--line-soft)" />
          ${chartContent}
          <text x="${padL}" y="${h - 5}" font-size="12" font-weight="600" fill="var(--text-dim)">${subset[0].d}</text>
          ${midLabel}
          <text x="${w - padR}" y="${h - 5}" font-size="12" font-weight="600" fill="var(--text-dim)" text-anchor="end">${subset[n - 1].d}</text>

          ${hoverElements}
        </svg>
      </div>
    `;
  }

  // ============================================================
  // チャート インタラクション登録 (マウスオーバーで数値を表示)
  // ============================================================
  function setupChartInteractions(b) {
    if (!b) return;

    // --- 1. 時間帯別PVグラフ (折れ線) ---
    const hourlyWrap = document.getElementById('hourlyChartWrap');
    const hourlySvg = document.getElementById('hourlySvg');
    if (hourlyWrap && hourlySvg && b.narou && b.narou.hourly) {
      const hourly = b.narou.hourly;
      const todayData = hourly.today || [];
      const yestData = hourly.yesterday || [];
      const maxVal = Math.max(...todayData, ...yestData, 1);

      const w = 600, h = 160;
      const padL = 30, padR = 15, padT = 15, padB = 25;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;

      const hoverGroup = hourlySvg.querySelector('.hourly-hover-group');
      const vLine = hourlySvg.querySelector('.hourly-v-line');
      const todayPt = hourlySvg.querySelector('.hourly-today-pt');
      const yestPt = hourlySvg.querySelector('.hourly-yest-pt');

      const handleMove = (e) => {
        const rect = hourlySvg.getBoundingClientRect();
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : null);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : null);
        if (clientX === null || clientY === null) return;

        const relX = (clientX - rect.left) / rect.width;
        const padLNorm = padL / w;
        const plotWNorm = plotW / w;
        const frac = (relX - padLNorm) / plotWNorm;
        const hour = Math.max(0, Math.min(23, Math.round(frac * 23)));

        const todayVal = todayData[hour] !== undefined ? todayData[hour] : 0;
        const yestVal = yestData[hour] !== undefined ? yestData[hour] : 0;
        const diff = todayVal - yestVal;

        const diffBadge = diff > 0 
          ? `<span class="chart-tooltip-badge up">+${diff.toLocaleString()} PV</span>` 
          : diff < 0 
            ? `<span class="chart-tooltip-badge down">${diff.toLocaleString()} PV</span>` 
            : '<span class="chart-tooltip-badge" style="background:var(--line-soft);color:var(--text-sub);">±0</span>';

        const ptX = padL + (hour / 23) * plotW;
        const todayY = padT + plotH - (todayVal / maxVal) * plotH;
        const yestY = padT + plotH - (yestVal / maxVal) * plotH;

        if (vLine) {
          vLine.setAttribute('x1', ptX);
          vLine.setAttribute('x2', ptX);
        }
        if (todayPt) {
          todayPt.setAttribute('cx', ptX);
          todayPt.setAttribute('cy', todayY);
        }
        if (yestPt) {
          yestPt.setAttribute('cx', ptX);
          yestPt.setAttribute('cy', yestY);
        }
        if (hoverGroup) hoverGroup.style.display = 'block';

        const html = `
          <div class="chart-tooltip-title">🕒 ${hour}:00 〜 ${hour}:59 の閲覧数</div>
          <div class="chart-tooltip-row">
            <span><span class="chart-tooltip-dot" style="background:var(--rose-deep);"></span>本日 (${hourly.todayDate || '本日'}):</span>
            <b>${todayVal.toLocaleString()} PV</b>
          </div>
          <div class="chart-tooltip-row">
            <span><span class="chart-tooltip-dot" style="background:var(--lilac);"></span>昨日 (${hourly.yesterdayDate || '昨日'}):</span>
            <b>${yestVal.toLocaleString()} PV</b>
          </div>
          <div class="chart-tooltip-row" style="margin-top:4px;padding-top:4px;border-top:1px dashed var(--line-soft);">
            <span>前日比:</span>
            ${diffBadge}
          </div>
        `;
        showChartTooltip(clientX, clientY, html);
      };

      const handleLeave = () => {
        if (hoverGroup) hoverGroup.style.display = 'none';
        hideChartTooltip();
      };

      hourlyWrap.addEventListener('mousemove', handleMove);
      hourlyWrap.addEventListener('pointermove', handleMove);
      hourlyWrap.addEventListener('mouseleave', handleLeave);
      hourlyWrap.addEventListener('pointerleave', handleLeave);
    }

    // --- 2. カクヨム 話数別 累計PVグラフ (折れ線) ---
    const retWrap = document.getElementById('retentionChartWrap');
    const retSvg = document.getElementById('retentionSvg');
    if (retWrap && retSvg && b.kakuyomu && b.kakuyomu.episodes && b.kakuyomu.episodes.length) {
      const episodes = b.kakuyomu.episodes;
      const n = episodes.length;
      const maxVal = Math.max(...episodes, 1);

      const w = 700, h = 140;
      const padL = 35, padR = 20, padT = 15, padB = 22;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;

      const hoverGroup = retSvg.querySelector('.retention-hover-group');
      const vLine = retSvg.querySelector('.retention-v-line');
      const retPt = retSvg.querySelector('.retention-pt');

      const handleMove = (e) => {
        const rect = retSvg.getBoundingClientRect();
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : null);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : null);
        if (clientX === null || clientY === null) return;

        const relX = (clientX - rect.left) / rect.width;
        const padLNorm = padL / w;
        const plotWNorm = plotW / w;
        const frac = (relX - padLNorm) / plotWNorm;
        const idx = Math.max(0, Math.min(n - 1, Math.round(frac * Math.max(1, n - 1))));

        const pv = episodes[idx];
        const firstPv = episodes[0] || 1;
        const retentionPct = ((pv / firstPv) * 100).toFixed(1);

        const ptX = padL + (idx / Math.max(1, n - 1)) * plotW;
        const ptY = padT + plotH - (pv / maxVal) * plotH;

        if (vLine) {
          vLine.setAttribute('x1', ptX);
          vLine.setAttribute('x2', ptX);
        }
        if (retPt) {
          retPt.setAttribute('cx', ptX);
          retPt.setAttribute('cy', ptY);
        }
        if (hoverGroup) hoverGroup.style.display = 'block';

        const html = `
          <div class="chart-tooltip-title">📖 カクヨム 第 ${idx + 1} 話</div>
          <div class="chart-tooltip-row">
            <span><span class="chart-tooltip-dot" style="background:var(--kakuyomu-color);"></span>累計閲覧数:</span>
            <b>${pv.toLocaleString()} PV</b>
          </div>
          <div class="chart-tooltip-row" style="margin-top:4px;padding-top:4px;border-top:1px dashed var(--line-soft);">
            <span>第1話比 読了定着率:</span>
            <b style="color:var(--forest);">${retentionPct}%</b>
          </div>
        `;
        showChartTooltip(clientX, clientY, html);
      };

      const handleLeave = () => {
        if (hoverGroup) hoverGroup.style.display = 'none';
        hideChartTooltip();
      };

      retWrap.addEventListener('mousemove', handleMove);
      retWrap.addEventListener('pointermove', handleMove);
      retWrap.addEventListener('mouseleave', handleLeave);
      retWrap.addEventListener('pointerleave', handleLeave);
    }

    // --- 3. なろう 日別PV推移グラフ & 期間切り替えタブ ---
    setupDailyRangeTabs(b);
    setupDailyHistoryInteractions(b);

    // --- 4. デバイス構成比 ドーナツグラフ & 凡例 ---
    const donutContainer = document.getElementById('donutChartContainer');
    if (donutContainer) {
      const items = donutContainer.querySelectorAll('.donut-slice, .donut-legend-item');
      items.forEach(el => {
        const handleEnter = (e) => {
          const name = el.dataset.name;
          const pct = el.dataset.pct;
          const pv = el.dataset.pv;
          const color = el.dataset.color;
          if (!name) return;

          const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 200);
          const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 200);

          const html = `
            <div class="chart-tooltip-title">📱 デバイス構成比 (なろう)</div>
            <div class="chart-tooltip-row">
              <span><span class="chart-tooltip-dot" style="background:${color};"></span>${name}:</span>
              <b>${pct}% (${Number(pv).toLocaleString()} PV)</b>
            </div>
          `;
          showChartTooltip(clientX, clientY, html);
        };

        el.addEventListener('mouseenter', handleEnter);
        el.addEventListener('pointerenter', handleEnter);
        el.addEventListener('mouseleave', hideChartTooltip);
        el.addEventListener('pointerleave', hideChartTooltip);
      });
    }
  }

  // なろう 日別PV推移の期間タブ初期化
  function setupDailyRangeTabs(b) {
    const tabsWrap = document.getElementById('dailyRangeTabs');
    if (!tabsWrap || !b || !b.narou || !b.narou.dailyHistory) return;

    tabsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.chart-tab-btn');
      if (!btn) return;
      const range = btn.dataset.range;
      if (!range || range === state.dailyHistoryRange) return;

      state.dailyHistoryRange = range;

      // タブボタンのアクティブ状態更新
      tabsWrap.querySelectorAll('.chart-tab-btn').forEach(bEl => {
        bEl.classList.toggle('active', bEl.dataset.range === range);
      });

      // 期間説明ラベルの更新
      const descEl = document.getElementById('narouDailyDesc');
      if (descEl) {
        descEl.textContent = getDailyRangeDesc(b.narou.dailyHistory, range);
      }

      // グラフSVGの再描画 & インタラクション再バインド
      const svgWrap = document.getElementById('narouDailySvgWrap');
      if (svgWrap) {
        svgWrap.innerHTML = renderDailyHistorySvg(b.narou.dailyHistory, range);
        setupDailyHistoryInteractions(b);
      }
    });
  }

  // なろう 日別PV推移のインタラクション (棒グラフ / エリアチャート両対応)
  function setupDailyHistoryInteractions(b) {
    const dailyWrap = document.getElementById('dailyHistoryChartWrap');
    const dailySvg = document.getElementById('dailyHistorySvg');
    if (!dailyWrap || !dailySvg || !b || !b.narou || !b.narou.dailyHistory || !b.narou.dailyHistory.length) return;

    const rangeMode = state.dailyHistoryRange || '30';
    const subset = getDailyHistorySubset(b.narou.dailyHistory, rangeMode);
    const n = subset.length;
    if (n === 0) return;

    const maxVal = Math.max(...subset.map(d => d.pv), 1);
    const w = 700, h = 140;
    const padL = 35, padR = 20, padT = 15, padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const isAreaMode = (rangeMode === 'all');

    const highlightBar = dailySvg.querySelector('.daily-highlight-bar');
    const hoverGroup = dailySvg.querySelector('.daily-hover-group');
    const vLine = dailySvg.querySelector('.daily-v-line');
    const hoverPt = dailySvg.querySelector('.daily-hover-pt');

    const handleMove = (e) => {
      const rect = dailySvg.getBoundingClientRect();
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : null);
      const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : null);
      if (clientX === null || clientY === null) return;

      const relX = (clientX - rect.left) / rect.width;
      const padLNorm = padL / w;
      const plotWNorm = plotW / w;
      const frac = (relX - padLNorm) / plotWNorm;

      // エリアチャートモードなら最寄りのデータ点(round)、棒グラフなら区間(floor)
      const idx = isAreaMode
        ? Math.max(0, Math.min(n - 1, Math.round(frac * Math.max(1, n - 1))))
        : Math.max(0, Math.min(n - 1, Math.floor(frac * n)));

      const item = subset[idx];
      if (!item) return;

      if (!isAreaMode) {
        // 棒グラフハイライト
        const x = padL + (idx / n) * plotW;
        const barH = (item.pv / maxVal) * plotH;
        const y = padT + plotH - barH;
        if (highlightBar) {
          highlightBar.setAttribute('x', x.toFixed(1));
          highlightBar.setAttribute('y', y.toFixed(1));
          highlightBar.setAttribute('height', Math.max(barH, 3).toFixed(1));
          highlightBar.style.display = 'block';
        }
      } else {
        // エリアチャートハイライト（垂直ガイド線 + ハイライトポイント）
        const x = padL + (idx / Math.max(1, n - 1)) * plotW;
        const y = padT + plotH - (item.pv / maxVal) * plotH;
        if (hoverGroup && vLine && hoverPt) {
          vLine.setAttribute('x1', x.toFixed(1));
          vLine.setAttribute('x2', x.toFixed(1));
          hoverPt.setAttribute('cx', x.toFixed(1));
          hoverPt.setAttribute('cy', y.toFixed(1));
          hoverGroup.style.display = 'block';
        }
      }

      const isSelected = item.date === state.selectedDate;

      const html = `
        <div class="chart-tooltip-title">📅 ${item.date} (${item.d}) ${isSelected ? '<span class="chart-tooltip-badge up">選択日</span>' : ''}</div>
        <div class="chart-tooltip-row">
          <span><span class="chart-tooltip-dot" style="background:var(--rose-deep);"></span>なろう閲覧数:</span>
          <b>${item.pv.toLocaleString()} PV</b>
        </div>
      `;
      showChartTooltip(clientX, clientY, html);
    };

    const handleLeave = () => {
      if (highlightBar) highlightBar.style.display = 'none';
      if (hoverGroup) hoverGroup.style.display = 'none';
      hideChartTooltip();
    };

    dailyWrap.addEventListener('mousemove', handleMove);
    dailyWrap.addEventListener('pointermove', handleMove);
    dailyWrap.addEventListener('mouseleave', handleLeave);
    dailyWrap.addEventListener('pointerleave', handleLeave);
  }

  // ============================================================
  // レンダリング: データ一覧テーブル (3つのタブ)
  // ============================================================
  function renderTables() {
    renderDailyTable();
    renderCumulativeTable();
    renderHistoryTable();
  }

  // タブ1: 指定日(今日)の作品別PV一覧
  function renderDailyTable() {
    const wrap = document.getElementById('tabDailyTable');
    if (!wrap) return;

    const rowsData = BOOKS.map(b => {
      const pv = getBookPvOnDate(b, state.selectedDate);
      return {
        book: b,
        naro: pv.naro,
        kaku: pv.kaku,
        total: pv.total,
      };
    }).sort((a, b) => b.total - a.total);

    const grandTotal = sum(rowsData.map(r => r.total));
    const maxVal = Math.max(...rowsData.map(r => r.total), 1);

    const isToday = state.selectedDate === TODAY_ISO;
    const dateLabel = isToday ? '本日' : formatDisplayDate(state.selectedDate).slice(5);

    let html = `
      <table>
        <thead>
          <tr>
            <th style="min-width:220px;">作品名</th>
            <th>なろう ${dateLabel}PV</th>
            <th>カクヨム ${dateLabel}PV</th>
            <th>合計PV</th>
            <th>全体シェア</th>
          </tr>
        </thead>
        <tbody>
    `;

    rowsData.forEach(r => {
      const ratio = maxVal > 0 ? r.total / maxVal : 0;
      const heat = getHeatColor(ratio);
      const share = grandTotal > 0 ? ((r.total / grandTotal) * 100).toFixed(1) : '0.0';

      html += `
        <tr style="cursor:pointer;" onclick="window.selectBookApp('${r.book.ncode}')">
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r.book.status === 'done' ? 'var(--gold)' : 'var(--lilac)'}"></span>
              <b>${r.book.shortTitle}</b>
            </div>
            <div class="table-sub-meta">
              ${r.book.startDate ? `<span>📅 ${formatStartDateShort(r.book.startDate)}開始 (${getDaysElapsed(r.book.startDate, state.selectedDate)}日目)</span>` : ''}
              ${r.book.episodes ? `<span>・ 全${r.book.episodes}話</span>` : ''}
            </div>
          </td>
          <td><span class="cell-pill" style="background:var(--narou-bg);color:var(--narou-color);">${r.naro.toLocaleString()}</span></td>
          <td><span class="cell-pill" style="background:var(--kakuyomu-bg);color:var(--kakuyomu-color);">${r.kaku.toLocaleString()}</span></td>
          <td><span class="cell-pill" style="background:${heat.bg};color:${heat.color};font-weight:700;">${r.total.toLocaleString()}</span></td>
          <td style="color:var(--text-sub);">${share}%</td>
        </tr>
      `;
    });

    html += `
        </tbody>
        <tfoot>
          <tr style="background:rgba(55,138,84,0.08);font-weight:700;">
            <td>合計 (${rowsData.length}作品)</td>
            <td>${sum(rowsData.map(r => r.naro)).toLocaleString()}</td>
            <td>${sum(rowsData.map(r => r.kaku)).toLocaleString()}</td>
            <td class="row-total">${grandTotal.toLocaleString()}</td>
            <td>100.0%</td>
          </tr>
        </tfoot>
      </table>
    `;

    wrap.innerHTML = html;
  }

  // タブ2: 累計PV一覧 (連載開始日・公開期間・日速平均・話数の相関比較対応)
  function renderCumulativeTable() {
    const wrap = document.getElementById('tabCumulativeTable');
    if (!wrap) return;

    const rowsData = BOOKS.map(b => {
      const naro = getNaroCumulative(b);
      const kaku = getKakuCumulative(b);
      return {
        book: b,
        naro: naro,
        kaku: kaku,
        total: naro + kaku,
      };
    }).sort((a, b) => b.total - a.total);

    const naroVals = rowsData.map(r => r.naro);
    const kakuVals = rowsData.map(r => r.kaku);
    const maxNaro = Math.max(...naroVals, 1);
    const maxKaku = Math.max(...kakuVals, 1);
    const grandTotal = sum(rowsData.map(r => r.total));

    const maxSpeed = Math.max(...rowsData.map(r => {
      const days = getDaysElapsed(r.book.startDate, state.selectedDate) || 1;
      return r.total / days;
    }), 1);

    let html = `
      <table>
        <thead>
          <tr>
            <th style="min-width:200px;">作品名</th>
            <th>ステータス</th>
            <th>連載開始日</th>
            <th>公開期間</th>
            <th>日速平均 (1日あたり)</th>
            <th>公開話数</th>
            <th>なろう累計PV</th>
            <th>カクヨム累計PV</th>
            <th>合算累計PV</th>
          </tr>
        </thead>
        <tbody>
    `;

    rowsData.forEach(r => {
      const naroRatio = r.naro / maxNaro;
      const kakuRatio = r.kaku / maxKaku;
      const heatNaro = getHeatColor(naroRatio);
      const heatKaku = getHeatColor(kakuRatio);

      const daysElapsed = getDaysElapsed(r.book.startDate, state.selectedDate) || 1;
      const dailySpeed = Math.round(r.total / daysElapsed);
      const speedRatio = dailySpeed / maxSpeed;
      const heatSpeed = getHeatColor(speedRatio);

      html += `
        <tr style="cursor:pointer;" onclick="window.selectBookApp('${r.book.ncode}')">
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r.book.status === 'done' ? 'var(--gold)' : 'var(--lilac)'}"></span>
              <b>${r.book.shortTitle}</b>
            </div>
          </td>
          <td><span style="font-size:12.5px;color:var(--text-sub);font-weight:600;">${r.book.status === 'done' ? '完結' : '連載中'}</span></td>
          <td style="font-size:13px;font-weight:600;color:var(--text-main);white-space:nowrap;">${formatStartDate(r.book.startDate)}</td>
          <td><span class="period-badge">${daysElapsed}日目</span></td>
          <td><span class="daily-speed-pill" style="background:${heatSpeed.bg};color:${heatSpeed.color};" title="合算累計PV ÷ 公開期間">${dailySpeed.toLocaleString()} PV/日</span></td>
          <td style="font-size:13px;font-weight:600;color:var(--text-sub);white-space:nowrap;">全${r.book.episodes || '-'}話</td>
          <td><span class="cell-pill" style="background:${heatNaro.bg};color:${heatNaro.color};">${r.naro.toLocaleString()}</span></td>
          <td><span class="cell-pill" style="background:${heatKaku.bg};color:${heatKaku.color};">${r.kaku.toLocaleString()}</span></td>
          <td class="row-total">${r.total.toLocaleString()}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
        <tfoot>
          <tr style="background:rgba(55,138,84,0.08);font-weight:700;">
            <td colspan="6">全作品累計合算</td>
            <td>${sum(naroVals).toLocaleString()}</td>
            <td>${sum(kakuVals).toLocaleString()}</td>
            <td class="row-total">${grandTotal.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    `;

    wrap.innerHTML = html;
  }

  // タブ3: 直近の日別PV推移テーブル
  function renderHistoryTable() {
    const wrap = document.getElementById('tabHistoryTable');
    if (!wrap) return;

    // 直近7日分の日付リストを生成
    const recentDates = [];
    for (let i = 6; i >= 0; i--) {
      recentDates.push(getRelativeDateIso(TODAY_ISO, -i));
    }

    const DOW_JP = ['日', '月', '火', '水', '木', '金', '土'];
    const dateHeaders = recentDates.map(dIso => {
      const [y, m, d] = dIso.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const dowCls = dow === 6 ? 'color:#1D4ED8;font-weight:700;' : dow === 0 ? 'color:#B91C1C;font-weight:700;' : 'font-weight:600;';
      return `<th>${m}/${d}<br><span style="font-size:12px;${dowCls}">(${DOW_JP[dow]})</span></th>`;
    }).join('');

    let rowsHtml = BOOKS.map(b => {
      const pvs = recentDates.map(dIso => getBookPvOnDate(b, dIso).total);
      const rowMax = Math.max(...pvs, 1);
      const rowSum = sum(pvs);

      const cells = pvs.map(pvVal => {
        const ratio = pvVal / rowMax;
        const heat = getHeatColor(ratio);
        return `<td><span class="cell-pill" style="background:${heat.bg};color:${heat.color};">${pvVal.toLocaleString()}</span></td>`;
      }).join('');

      return `
        <tr style="cursor:pointer;" onclick="window.selectBookApp('${b.ncode}')">
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${b.status === 'done' ? 'var(--gold)' : 'var(--lilac)'}"></span>
              <b>${b.shortTitle}</b>
            </div>
            <div class="table-sub-meta">
              ${b.startDate ? `<span>📅 ${formatStartDateShort(b.startDate)}〜</span>` : ''}
              ${b.episodes ? `<span>・ 全${b.episodes}話</span>` : ''}
            </div>
          </td>
          ${cells}
          <td class="row-total">${rowSum.toLocaleString()}</td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="min-width:200px;">作品名</th>
            ${dateHeaders}
            <th>7日間計</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }

  // ============================================================
  // イベントリスナーのセットアップ
  // ============================================================
  function setupEventListeners() {
    // 最新データ更新ボタン & 最終取得バッジのクリック
    const reloadLatest = () => {
      const btn = document.getElementById('refreshDataBtn');
      if (btn) btn.classList.add('loading');
      const badge = document.getElementById('headerDateBadge');
      if (badge) badge.style.opacity = '0.5';
      // 動的キャッシュバスターが埋め込まれているため、再読み込みで確実に最新データを取得
      window.location.reload();
    };

    const refreshBtn = document.getElementById('refreshDataBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', reloadLatest);
    }

    const dateBadge = document.getElementById('headerDateBadge');
    if (dateBadge) {
      dateBadge.addEventListener('click', reloadLatest);
    }

    // タブ復帰（バックグラウンドから戻った際）の自動更新チェック (10分以上経過していれば自動リフレッシュ)
    let lastActiveTime = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const elapsedMinutes = (Date.now() - lastActiveTime) / (1000 * 60);
        if (elapsedMinutes >= 10) {
          console.log('[Novel-PV] 10分以上経過後のタブ復帰を検知したため最新データを取得します');
          reloadLatest();
        } else {
          lastActiveTime = Date.now();
        }
      }
    });

    // ページを開きっぱなしの場合の定期自動更新 (15分ごと)
    setInterval(() => {
      console.log('[Novel-PV] 定期自動更新を実行します');
      reloadLatest();
    }, 15 * 60 * 1000);

    // テーマ切り替え
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme(state.theme);
      });
    }

    // ガイドモーダル
    const guideBtn = document.getElementById('guideModalBtn');
    const modalOverlay = document.getElementById('guideModal');
    const closeBtn = document.getElementById('guideCloseBtn');
    if (guideBtn && modalOverlay && closeBtn) {
      guideBtn.addEventListener('click', () => modalOverlay.classList.add('active'));
      closeBtn.addEventListener('click', () => modalOverlay.classList.remove('active'));
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) modalOverlay.classList.remove('active');
      });
    }

    // 日付コントロール
    const todayBtn = document.getElementById('btnDateToday');
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        state.selectedDate = TODAY_ISO;
        onDateChanged();
      });
    }

    const yesterdayBtn = document.getElementById('btnDateYesterday');
    if (yesterdayBtn) {
      yesterdayBtn.addEventListener('click', () => {
        state.selectedDate = getRelativeDateIso(TODAY_ISO, -1);
        onDateChanged();
      });
    }

    const prevDayBtn = document.getElementById('btnPrevDay');
    if (prevDayBtn) {
      prevDayBtn.addEventListener('click', () => {
        state.selectedDate = getRelativeDateIso(state.selectedDate, -1);
        onDateChanged();
      });
    }

    const nextDayBtn = document.getElementById('btnNextDay');
    if (nextDayBtn) {
      nextDayBtn.addEventListener('click', () => {
        state.selectedDate = getRelativeDateIso(state.selectedDate, 1);
        onDateChanged();
      });
    }

    const datePicker = document.getElementById('datePicker');
    if (datePicker) {
      datePicker.addEventListener('change', (e) => {
        if (e.target.value) {
          state.selectedDate = e.target.value;
          onDateChanged();
        }
      });
    }

    // テーブルのタブ切り替え
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tabTarget = btn.dataset.tab;
        document.getElementById('tabDailyTable').style.display = tabTarget === 'daily' ? 'block' : 'none';
        document.getElementById('tabCumulativeTable').style.display = tabTarget === 'cumulative' ? 'block' : 'none';
        document.getElementById('tabHistoryTable').style.display = tabTarget === 'history' ? 'block' : 'none';
      });
    });
  }

  function onDateChanged() {
    renderDateToolbar();
    renderKpiSummary();
    renderWorkSelector();
    renderDetailPanel();
    renderTables();
  }

  // グローバル公開 (行クリックから詳細を開くため)
  window.selectBookApp = function (ncode) {
    selectBook(ncode);
    const detailEl = document.getElementById('detailSection');
    if (detailEl) {
      detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 初期化
  function init() {
    applyTheme(state.theme);

    // 最終更新日時の反映
    const lastUpdatedEl = document.getElementById('lastUpdated');
    if (lastUpdatedEl && typeof LAST_UPDATED !== 'undefined') {
      lastUpdatedEl.textContent = LAST_UPDATED;
    }

    // 初期選択作品（急上昇作品または1作目）
    const initialBook = BOOKS.find(b => b.hot) || BOOKS[0];
    if (initialBook) {
      state.selectedNcode = initialBook.ncode;
    }

    setupEventListeners();
    onDateChanged();
  }

  // DOMロード時に開始
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
