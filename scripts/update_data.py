#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
小説家になろう & カクヨム PVモニタ データ自動更新スクリプト (毎時実行対応)

機能:
- config.json から監視対象の作品一覧を読み込み
- 小説家になろう（KASASAGI アクセス解析 & Syosetu 公式API & ランキングAPI）からデータ取得
- カクヨム（アクセス解析ページ & 作品メインページ）からデータ取得
- カクヨムの日別PVをキャッシュ追跡（日次スナップショット差分から日別PVを自動算出）
- なろう・カクヨムそれぞれの「今日のPV」「指定日のPV」「累計PV」を構造化して data.js に出力
"""

import html as html_lib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

JST = timezone(timedelta(hours=9))
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 pv-checker-bot/2.0"
}
TIMEOUT = 25

# キャッシュファイルのパス
DAILY_CACHE_PATH = "scripts/naro_daily_pv_cache.json"
CHAPTER_CACHE_PATH = "scripts/naro_episode_cache.json"
KAKUYOMU_STATS_CACHE_PATH = "scripts/kakuyomu_stats_cache.json"
KAKUYOMU_DAILY_CACHE_PATH = "scripts/kakuyomu_daily_cache.json"
RANKINGS_AUTO_PATH = "scripts/rankings_auto.json"
RANKINGS_MANUAL_PATH = "rankings_manual.json"


def fetch(url):
    """URLからHTMLまたはテキストを取得"""
    r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.text


def strip_tags(html):
    """HTMLタグを除去してプレーンテキストを返す"""
    return html_lib.unescape(re.sub(r"<[^>]+>", "", html))


def extract_js_array(html, varname):
    """HTML内の JavaScript 配列定義を抽出"""
    m = re.search(rf"(?:let|var|const)\s+{varname}\s*=\s*(\[.*?\]);\n", html, re.S)
    if not m:
        # 改行なしパターンも考慮
        m = re.search(rf"(?:let|var|const)\s+{varname}\s*=\s*(\[.*?\]);", html, re.S)
    if not m:
        return None
    return json.loads(m.group(1))


def load_json_cache(path):
    """JSONキャッシュを読み込み"""
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Failed to load {path}: {e}", file=sys.stderr)
    return {}


def save_json_cache(path, cache):
    """JSONキャッシュを保存"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2, sort_keys=True)


# ============================================================
# 小説家になろう (KASASAGI / API) パース関数
# ============================================================

def parse_kasasagi(ncode):
    """
    KASASAGI トップページから週間PV、本日・昨日の時間帯別PV、デバイス比率を取得
    """
    url = f"https://kasasagi.hinaproject.com/access/top/ncode/{ncode}/"
    html = fetch(url)

    week_raw = extract_js_array(html, "chart_data_week")
    today_raw = extract_js_array(html, "chart_data_today")
    yesterday_raw = extract_js_array(html, "chart_data_yesterday")
    if not (week_raw and today_raw and yesterday_raw):
        raise ValueError(f"chart data not found for {ncode}")

    week_rows = week_raw[1:]
    week = [{"d": row[0].replace("\u3000", " "), "pv": row[2] + row[3] + row[4]} for row in week_rows]
    pc = sum(r[2] for r in week_rows)
    sp = sum(r[3] for r in week_rows)
    app = sum(r[4] for r in week_rows)

    today_hours = [row[2] + row[3] + row[4] for row in today_raw[1:]]
    yesterday_hours = [row[2] + row[3] + row[4] for row in yesterday_raw[1:]]

    text = strip_tags(html)
    unique_m = re.search(r"累計ユニークアクセス\s*([\d,]+)\s*人", text)
    unique = int(unique_m.group(1).replace(",", "")) if unique_m else None

    # 連載開始日
    period_m = re.search(r"期間\s*(\d{4})/(\d{2})/(\d{2})\([^)]+\)\s*-\s*(\d{4})/(\d{2})/(\d{2})\([^)]+\)", text)
    period_start = f"{period_m.group(1)}-{period_m.group(2)}-{period_m.group(3)}" if period_m else None

    # 本日・昨日の日付
    today_date_m = re.search(r"本日\s*(\d{4}/\d{2}/\d{2})", text)
    yesterday_date_m = re.search(r"昨日\s*(\d{4}/\d{2}/\d{2})", text)
    today_date = today_date_m.group(1)[5:].replace("/", "/") if today_date_m else None
    yesterday_date = yesterday_date_m.group(1)[5:].replace("/", "/") if yesterday_date_m else None

    return {
        "week": week,
        "unique": unique,
        "pc": pc,
        "sp": sp,
        "app": app,
        "periodStart": period_start,
        "hourly": {
            "todayDate": today_date,
            "yesterdayDate": yesterday_date,
            "today": today_hours,
            "yesterday": yesterday_hours,
        },
    }


def empty_kasasagi():
    """未公開作品用などの空のなろうアクセス解析データ"""
    return {
        "week": [],
        "unique": 0,
        "pc": 0,
        "sp": 0,
        "app": 0,
        "periodStart": None,
        "hourly": {
            "todayDate": None,
            "yesterdayDate": None,
            "today": [0] * 24,
            "yesterday": [0] * 24,
        },
    }


def parse_kasasagi_day_page(ncode, month=None):
    """
    なろうの「日別」ページを取得し、指定月（または当月）の日別PVを返す
    month: 'YYYYMM' 形式の文字列（例: '202609'）または None
    """
    url = f"https://kasasagi.hinaproject.com/access/day/ncode/{ncode}/"
    if month:
        url += f"?month={month}"
    html = fetch(url)
    allpv = extract_js_array(html, "chart_data_allpv")
    if not allpv:
        raise ValueError(f"chart_data_allpv not found for {ncode}")

    text = strip_tags(html)
    ym_m = re.search(r"(\d{4})年(\d{1,2})月のページビュー", text)
    if not ym_m:
        ym_m = re.search(r"(\d{4})年(\d{1,2})月", text)
    if ym_m:
        year = ym_m.group(1)
    elif month:
        year = str(month)[:4]
    else:
        year = str(datetime.now(JST).year)

    result = {}
    for row in allpv[1:]:
        label = row[0]
        m = re.match(r"(\d{1,2})/(\d{1,2})", label)
        if not m:
            continue
        mm, dd = m.groups()
        date_str = f"{year}-{int(mm):02d}-{int(dd):02d}"
        pc, sp, app = row[2], row[3], row[4]
        result[date_str] = {"pv": pc + sp + app, "pc": pc, "sp": sp, "app": app}
    return result


def build_naro_daily_history(ncode, kasasagi, daily_cache):
    """
    確定済みの日（2日前以前）をキャッシュに保存し、直近2日はライブ値（hourly合計）を反映して
    全期間の日別PV履歴（昇順）を返す。
    月初や月跨ぎ時は前月（?month=YYYYMM）も取得して月末の確定漏れを防止する。
    """
    today = datetime.now(JST).date()
    finalized_cutoff = today - timedelta(days=2)

    book_days = daily_cache.setdefault(ncode, {}).setdefault("days", {})

    # 取得対象月（当月は基本取得。月初や確定日が前月にまたがる場合は前月も取得）
    months_to_fetch = [None]
    prev_month_date = today.replace(day=1) - timedelta(days=1)
    prev_month_str = prev_month_date.strftime("%Y%m")
    current_month_str = today.strftime("%Y%m")
    cutoff_month_str = finalized_cutoff.strftime("%Y%m")
    last_day_of_prev_month = prev_month_date.strftime("%Y-%m-%d")

    if today.day <= 5 or cutoff_month_str != current_month_str or last_day_of_prev_month not in book_days:
        months_to_fetch.insert(0, prev_month_str)

    for m in months_to_fetch:
        try:
            month_data = parse_kasasagi_day_page(ncode, month=m)
            for date_str, v in month_data.items():
                d = datetime.strptime(date_str, "%Y-%m-%d").date()
                if d <= finalized_cutoff:
                    book_days[date_str] = v
            if m:
                time.sleep(0.3)
        except Exception as e:
            m_label = m or "current"
            print(f"  day page fetch failed {ncode} ({m_label}): {e}", file=sys.stderr)

    # 確定キャッシュ + 直近2日のライブ値を合成
    combined = dict(book_days)
    if kasasagi["hourly"]["yesterdayDate"]:
        y_total = sum(kasasagi["hourly"]["yesterday"])
        y_date = _mmdd_to_iso(kasasagi["hourly"]["yesterdayDate"], today)
        if y_date:
            combined[y_date] = {"pv": y_total, "pc": None, "sp": None, "app": None}
    if kasasagi["hourly"]["todayDate"]:
        t_total = sum(kasasagi["hourly"]["today"])
        t_date = _mmdd_to_iso(kasasagi["hourly"]["todayDate"], today)
        if t_date:
            combined[t_date] = {"pv": t_total, "pc": None, "sp": None, "app": None}

    history = []
    for date_str in sorted(combined.keys()):
        mm, dd = date_str.split("-")[1:]
        history.append({
            "d": f"{int(mm)}/{int(dd)}",
            "date": date_str,
            "pv": combined[date_str]["pv"],
        })

    period_start = kasasagi.get("periodStart")
    if period_start:
        history = [h for h in history if h["date"] >= period_start]

    return history


def _mmdd_to_iso(mmdd, today):
    """'MM/DD' を 'YYYY-MM-DD' に変換（年跨ぎ対応）"""
    m = re.match(r"(\d{1,2})/(\d{1,2})", mmdd)
    if not m:
        return None
    mm, dd = int(m.group(1)), int(m.group(2))
    year = today.year
    # 1月に前年12月の日付を参照している場合の年跨ぎ補正
    if today.month == 1 and mm == 12:
        year -= 1
    return f"{year}-{mm:02d}-{dd:02d}"


def parse_kasasagi_chapter_for_date(ncode, date_str):
    """指定日のエピソード別PVを取得"""
    url = f"https://kasasagi.hinaproject.com/access/chapter/ncode/{ncode}/?date={date_str}"
    html = fetch(url)
    allpv = extract_js_array(html, "chart_data_allpv")
    if not allpv:
        return None

    def ep_num(label):
        m = re.match(r"ep\.(\d+)", label)
        return int(m.group(1)) if m else None

    result = {}
    for r in allpv[1:]:
        n = ep_num(r[0])
        if n is not None:
            result[n] = r[2]
    return result


def build_naro_episode_cumulative(ncode, period_start, chapter_cache):
    """
    連載開始日から集計確定日(today-2)までのエピソード別PVをキャッシュ蓄積し累計を返す
    """
    today = datetime.now(JST).date()
    finalized_cutoff = today - timedelta(days=2)

    if not period_start:
        start_str = (finalized_cutoff - timedelta(days=30)).strftime("%Y-%m-%d")
    else:
        start_str = period_start
    end_str = finalized_cutoff.strftime("%Y-%m-%d")

    book_cache = chapter_cache.setdefault(ncode, {})
    days = book_cache.setdefault("days", {})

    start = datetime.strptime(start_str, "%Y-%m-%d").date()
    end = datetime.strptime(end_str, "%Y-%m-%d").date()
    
    # 未取得日を日次取得
    curr = start
    fetched_count = 0
    while curr <= end and fetched_count < 15:  # 毎回の負荷軽減のため一度に最大15日分まで
        d_str = curr.strftime("%Y-%m-%d")
        if d_str not in days:
            try:
                ep_pv = parse_kasasagi_chapter_for_date(ncode, d_str)
                if ep_pv is not None:
                    days[d_str] = ep_pv
                fetched_count += 1
                time.sleep(0.3)
            except Exception as e:
                print(f"  chapter fetch failed {ncode} {d_str}: {e}", file=sys.stderr)
        curr += timedelta(days=1)

    totals = {}
    for d, ep_pv in days.items():
        for ep, pv in ep_pv.items():
            ep = int(ep)
            totals[ep] = totals.get(ep, 0) + pv

    if not totals:
        return []
    max_ep = max(totals.keys())
    return [totals.get(i, 0) for i in range(1, max_ep + 1)]


def fetch_narou_api_stats(ncodes):
    """なろう公式APIから総合点・ブックマーク数・感想数・初回掲載日・話数等を取得"""
    joined = "-".join(ncodes)
    url = f"https://api.syosetu.com/novelapi/api/?ncode={joined}&out=json"
    r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    rows = r.json()
    result = {}
    for row in rows:
        if "ncode" not in row:
            continue
        ncode_lower = row["ncode"].lower()
        all_hyoka_cnt = row.get("all_hyoka_cnt", 0)
        all_point = row.get("all_point", 0)
        rating_avg = round(all_point / all_hyoka_cnt, 1) if all_hyoka_cnt else None
        firstup_raw = row.get("general_firstup", "")
        firstup_date = firstup_raw.split(" ")[0] if firstup_raw else None
        all_no = row.get("general_all_no", 0)
        result[ncode_lower] = {
            "bookmarks": row.get("fav_novel_cnt", 0),
            "globalPoint": row.get("global_point", 0),
            "weeklyPoint": row.get("weekly_point", 0),
            "reviewCnt": row.get("review_cnt", 0),
            "impressionCnt": row.get("impression_cnt", 0),
            "ratingAvg": rating_avg,
            "ratingCnt": all_hyoka_cnt,
            "firstup": firstup_date,
            "episodes": all_no,
        }
    return result


def fetch_narou_top300(rtype):
    """なろう公式ランキングAPIから指定種別のTop300を取得"""
    url = f"https://api.syosetu.com/rank/rankget/?rtype={rtype}&out=json"
    r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    rows = r.json()
    return {row["ncode"].lower(): {"rank": row["rank"], "pt": row["pt"]} for row in rows}


def check_and_record_rankings(ncodes, auto_cache):
    """日間・週間・月間ランキングを自動検知して記録"""
    today = datetime.now(JST).date()
    candidates = [
        (today - timedelta(days=1), "d", "日間"),
        (today - timedelta(days=(today.weekday() - 1) % 7), "w", "週間"),
        (today.replace(day=1), "m", "月間"),
    ]

    for date_obj, code, label in candidates:
        rtype = f"{date_obj.strftime('%Y%m%d')}-{code}"
        try:
            top300 = fetch_narou_top300(rtype)
        except Exception as e:
            print(f"  ranking fetch failed ({rtype}): {e}", file=sys.stderr)
            continue
        for ncode in ncodes:
            entry = top300.get(ncode.lower())
            if not entry:
                continue
            book_history = auto_cache.setdefault(ncode.lower(), [])
            dup = any(h["date"] == date_obj.isoformat() and h["type"] == label for h in book_history)
            if not dup:
                book_history.append({
                    "date": date_obj.isoformat(),
                    "type": label,
                    "rank": entry["rank"],
                    "pt": entry["pt"],
                    "source": "auto",
                })
                print(f"  ランクイン検知: {ncode} {label} {entry['rank']}位", file=sys.stderr)


def build_rank_history(ncode, auto_cache, manual_rankings):
    """自動検知＋手動記録のランキング履歴を合成"""
    history = []
    for h in auto_cache.get(ncode.lower(), []):
        history.append({
            "date": h["date"],
            "label": h["type"],
            "rank": h["rank"],
            "note": f"{h['pt']}pt",
            "source": "auto",
        })
    for h in manual_rankings.get(ncode, []):
        history.append({
            "date": h["date"],
            "label": h["label"],
            "rank": h["rank"],
            "note": h.get("note", ""),
            "source": "manual",
        })
    history.sort(key=lambda h: h["date"], reverse=True)
    return history


# ============================================================
# カクヨム パース & 日別PV追跡関数
# ============================================================

def parse_kakuyomu_work_stats(work_id):
    """作品メインページからフォロワー数・レビュー・コメント数を取得"""
    url = f"https://kakuyomu.jp/works/{work_id}"
    html = fetch(url)
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        raise ValueError(f"__NEXT_DATA__ not found for work {work_id}")
    data = json.loads(m.group(1))
    apollo = data["props"]["pageProps"]["__APOLLO_STATE__"]
    work = apollo.get(f"Work:{work_id}")
    if not work:
        raise ValueError(f"Work:{work_id} not found in Apollo state")

    followers = work.get("totalFollowers", 0)
    review_point_sum = work.get("totalReviewPoint", 0)
    review_count = work.get("reviewCount", 0)
    comments = work.get("totalPublicEpisodeCommentCount", 0)
    review_avg = round(review_point_sum / review_count, 1) if review_count else None

    return {
        "followers": followers,
        "reviewPoints": review_point_sum,
        "reviewAvg": review_avg,
        "reviewCount": review_count,
        "comments": comments,
    }


def parse_kakuyomu(work_id):
    """カクヨム アクセスページから累計PV、各話PV、応援数を取得"""
    url = f"https://kakuyomu.jp/works/{work_id}/accesses"
    html = fetch(url)

    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        raise ValueError(f"__NEXT_DATA__ not found for {work_id}")
    data = json.loads(m.group(1))
    apollo = data["props"]["pageProps"]["__APOLLO_STATE__"]
    work_key = next(k for k in apollo if k.startswith("Work:"))
    work = apollo[work_key]

    total_pv = work["totalReadCount"]

    episode_list_key = next(k for k in work if k.startswith("publicEpisodeUnions"))
    episodes = []
    episode_cheers = []
    for ref in work[episode_list_key]["nodes"]:
        ep = apollo[ref["__ref"]]
        episodes.append(ep["readCount"])
        episode_cheers.append(ep.get("publicCheerCount", 0))
    total_cheers = sum(episode_cheers)

    text = strip_tags(html)
    period_m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日\s*\d{1,2}:\d{2}\s*から", text)
    period_start = f"{period_m.group(1)}-{int(period_m.group(2)):02d}-{int(period_m.group(3)):02d}" if period_m else None

    return {
        "totalPv": total_pv,
        "periodStart": period_start,
        "episodes": episodes,
        "episodeCheers": episode_cheers,
        "totalCheers": total_cheers,
    }


def track_kakuyomu_daily(work_id, total_pv, kakuyomu_daily_cache):
    """
    カクヨムの累計PVのスナップショットを記録し、日別PV推移および今日のPVを算出。
    カクヨム公式には未ログイン公開の「本日PV」がないため、
    毎時実行で累計PVの差分（今日の増分）を自動集計・追跡します。
    """
    today_str = datetime.now(JST).strftime("%Y-%m-%d")
    work_entry = kakuyomu_daily_cache.setdefault(str(work_id), {})
    days = work_entry.setdefault("days", {})

    # 旧形式のマイグレーション
    if "snapshots" in work_entry and not days:
        for d_str, snap_val in work_entry["snapshots"].items():
            days[d_str] = {"start": snap_val, "latest": snap_val}

    if today_str not in days:
        # 今日の初回取得時: 前日の最新累計値があればそれを本日の開始値(start)に。
        # 初回計測開始日なら今回の total_pv を start に設定。
        sorted_prev = [d for d in sorted(days.keys()) if d < today_str]
        prev_latest = days[sorted_prev[-1]]["latest"] if sorted_prev else total_pv
        days[today_str] = {
            "start": prev_latest,
            "latest": total_pv
        }
    else:
        # 同日内の2回目以降の実行時: 最新累計値を更新
        days[today_str]["latest"] = total_pv

    # 今日のPV = 本日最新累計値 - 本日開始時累計値（前日終値）
    today_pv = max(0, days[today_str]["latest"] - days[today_str]["start"])

    # 日別PV履歴（昇順）
    daily_history = []
    for d in sorted(days.keys()):
        day_pv = max(0, days[d]["latest"] - days[d]["start"])
        mm, dd = d.split("-")[1:]
        daily_history.append({
            "d": f"{int(mm)}/{int(dd)}",
            "date": d,
            "pv": day_pv,
        })

    return {
        "dailyHistory": daily_history,
        "todayPv": today_pv,
    }


# ============================================================
# データ結合 & JavaScript 生成
# ============================================================

def js_string(s):
    return json.dumps(s, ensure_ascii=False)


def render_book_data(book, kasasagi, kakuyomu, kakuyomu_daily, naro_cumulative, naro_history, narou_extra, rank_history):
    """1つの作品のデータオブジェクト文字列を生成"""
    week_lines = ", ".join(f'{{ d: {js_string(w["d"])}, pv: {w["pv"]} }}' for w in kasasagi["week"])
    ep_line = ", ".join(str(v) for v in kakuyomu["episodes"])
    today_line = ", ".join(str(v) for v in kasasagi["hourly"]["today"])
    yesterday_line = ", ".join(str(v) for v in kasasagi["hourly"]["yesterday"])

    # なろう今日のPV (本日時間帯別の合計)
    naro_today_pv = sum(kasasagi["hourly"]["today"])
    # なろう昨日のPV
    naro_yesterday_pv = sum(kasasagi["hourly"]["yesterday"])
    # なろう累計PV (全期間日別合計 または 章別合計)
    naro_cumulative_pv = sum(h["pv"] for h in naro_history) if naro_history else (sum(naro_cumulative) if naro_cumulative else 0)

    # カクヨム今日のPV
    kakuyomu_today_pv = kakuyomu_daily["todayPv"]
    # カクヨム累計PV
    kakuyomu_total_pv = kakuyomu["totalPv"]

    # 急上昇の簡易判定
    week_pvs = [w["pv"] for w in kasasagi["week"]]
    avg = sum(week_pvs) / len(week_pvs) if week_pvs else 0
    auto_hot = avg > 0 and naro_today_pv > avg * 2.5
    hot = book.get("hot_override", auto_hot)
    note = book.get("note_override", "")
    if hot and not note:
        note = "直近平均の2.5倍を超えるPVを検出"

    tags = list(book.get("tags", []))
    if hot and "急上昇" not in tags:
        tags.append("急上昇")

    naro_ep_line = ", ".join(str(v) for v in naro_cumulative)
    naro_hist_line = ", ".join(
        f'{{ d: {js_string(h["d"])}, date: {js_string(h["date"])}, pv: {h["pv"]} }}' for h in naro_history
    )
    kakuyomu_hist_line = ", ".join(
        f'{{ d: {js_string(h["d"])}, date: {js_string(h["date"])}, pv: {h["pv"]} }}' for h in kakuyomu_daily["dailyHistory"]
    )

    # 連載開始日
    naro_start = narou_extra.get("firstup") or kasasagi.get("periodStart") or ""
    kaku_start = kakuyomu.get("periodStart") or ""
    start_candidates = [d for d in [naro_start, kaku_start] if d]
    start_date = min(start_candidates) if start_candidates else ""

    # 話数
    naro_episodes = narou_extra.get("episodes") or len(naro_cumulative)
    kaku_episodes = len(kakuyomu["episodes"]) if kakuyomu.get("episodes") else 0
    total_episodes = max(naro_episodes, kaku_episodes)

    return f"""  {{
    ncode: {js_string(book["ncode"])},
    title: {js_string(book["title"])},
    shortTitle: {js_string(book["shortTitle"])},
    status: {js_string(book.get("status", "ongoing"))},
    genre: {js_string(book.get("genre", ""))},
    order: {book.get("order", 99)},
    cover: {js_string(book.get("cover", ""))},
    startDate: {js_string(start_date)},
    episodes: {total_episodes},
    tags: [{", ".join(js_string(t) for t in tags)}],
    mood: {js_string(book.get("mood", ""))},

    // 集計サマリー (本日 & 累計)
    todayPv: {naro_today_pv + kakuyomu_today_pv},
    cumulativePv: {naro_cumulative_pv + kakuyomu_total_pv},

    // 小説家になろう データ
    narou: {{
      todayPv: {naro_today_pv},
      yesterdayPv: {naro_yesterday_pv},
      cumulativePv: {naro_cumulative_pv},
      startDate: {js_string(naro_start)},
      episodes: {naro_episodes},
      unique: {kasasagi["unique"]},
      pc: {kasasagi["pc"]},
      sp: {kasasagi["sp"]},
      app: {kasasagi["app"]},
      week: [{week_lines}],
      hourly: {{
        todayDate: {js_string(kasasagi["hourly"]["todayDate"] or "")},
        yesterdayDate: {js_string(kasasagi["hourly"]["yesterdayDate"] or "")},
        today:     [{today_line}],
        yesterday: [{yesterday_line}],
      }},
      dailyHistory: [{naro_hist_line}],
      episodeCumulative: [{naro_ep_line}],
      stats: {{
        bookmarks: {narou_extra.get("bookmarks", 0)},
        globalPoint: {narou_extra.get("globalPoint", 0)},
        weeklyPoint: {narou_extra.get("weeklyPoint", 0)},
        reviewCnt: {narou_extra.get("reviewCnt", 0)},
        impressionCnt: {narou_extra.get("impressionCnt", 0)},
        ratingAvg: {narou_extra.get("ratingAvg") if narou_extra.get("ratingAvg") is not None else "null"},
        ratingCnt: {narou_extra.get("ratingCnt", 0)},
      }}
    }},

    // カクヨム データ
    kakuyomu: {{
      workId: {js_string(book["kakuyomuId"])},
      todayPv: {kakuyomu_today_pv},
      totalPv: {kakuyomu_total_pv},
      startDate: {js_string(kaku_start)},
      periodStart: {js_string(kaku_start)},
      episodesCount: {kaku_episodes},
      dailyHistory: [{kakuyomu_hist_line}],
      episodes: [{ep_line}],
      followers: {kakuyomu.get("followers", 0)},
      reviewPoints: {kakuyomu.get("reviewPoints", 0)},
      reviewAvg: {kakuyomu.get("reviewAvg") if kakuyomu.get("reviewAvg") is not None else "null"},
      reviewCount: {kakuyomu.get("reviewCount", 0)},
      comments: {kakuyomu.get("comments", 0)},
      cheers: {kakuyomu.get("totalCheers", 0)},
    }},

    // 互換用フラグ・注記
    hot: {str(hot).lower()},
    note: {js_string(note)},
    rankHistory: [{", ".join(
        f'{{ date: {js_string(h["date"])}, label: {js_string(h["label"])}, rank: {h["rank"]}, note: {js_string(h["note"])}, source: {js_string(h["source"])} }}'
        for h in rank_history
    )}],
  }},"""


def render_prerelease_book(book):
    """配信前スタブ"""
    tags = list(book.get("tags", []))
    if "配信前" not in tags:
        tags.append("配信前")
    release_note = f"配信開始予定: {book.get('releaseDate', '未定')}"
    return f"""  {{
    ncode: {js_string(book["ncode"])},
    title: {js_string(book["title"])},
    shortTitle: {js_string(book["shortTitle"])},
    status: {js_string(book.get("status", "ongoing"))},
    prerelease: true,
    releaseDate: {js_string(book.get("releaseDate", ""))},
    startDate: {js_string(book.get("releaseDate", ""))},
    genre: {js_string(book.get("genre", ""))},
    order: {book.get("order", 99)},
    cover: {js_string(book.get("cover", ""))},
    episodes: 0,
    tags: [{", ".join(js_string(t) for t in tags)}],
    mood: {js_string(book.get("mood", ""))},
    todayPv: 0,
    cumulativePv: 0,
    narou: {{
      todayPv: 0, yesterdayPv: 0, cumulativePv: 0, startDate: "", episodes: 0, unique: 0, pc: 0, sp: 0, app: 0,
      week: [], hourly: {{ todayDate: "", yesterdayDate: "", today: [], yesterday: [] }},
      dailyHistory: [], episodeCumulative: [],
      stats: {{ bookmarks: 0, globalPoint: 0, weeklyPoint: 0, reviewCnt: 0, impressionCnt: 0, ratingAvg: null, ratingCnt: 0 }}
    }},
    kakuyomu: {{
      workId: {js_string(book["kakuyomuId"])},
      todayPv: 0, totalPv: 0, startDate: "", periodStart: "", episodesCount: 0, dailyHistory: [], episodes: [],
      followers: 0, reviewPoints: 0, reviewAvg: null, reviewCount: 0, comments: 0, cheers: 0
    }},
    hot: false,
    note: {js_string(release_note)},
    rankHistory: []
  }},"""


def main():
    print(f"=== PV Monitor Update Started at {datetime.now(JST).isoformat()} ===", file=sys.stderr)
    
    with open("config.json", "r", encoding="utf-8") as f:
        config = json.load(f)

    chapter_cache = load_json_cache(CHAPTER_CACHE_PATH)
    daily_cache = load_json_cache(DAILY_CACHE_PATH)
    kakuyomu_stats_cache = load_json_cache(KAKUYOMU_STATS_CACHE_PATH)
    kakuyomu_daily_cache = load_json_cache(KAKUYOMU_DAILY_CACHE_PATH)
    rankings_auto = load_json_cache(RANKINGS_AUTO_PATH)
    manual_rankings = load_json_cache(RANKINGS_MANUAL_PATH)

    all_ncodes = [b["ncode"] for b in config["books"]]

    # なろう公式API取得
    try:
        narou_api_stats = fetch_narou_api_stats(all_ncodes)
    except Exception as e:
        print(f"WARNING: Narou API stats failed: {e}", file=sys.stderr)
        narou_api_stats = {}

    # ランキング自動検知
    try:
        check_and_record_rankings(all_ncodes, rankings_auto)
    except Exception as e:
        print(f"WARNING: Ranking check failed: {e}", file=sys.stderr)

    rendered_books = []
    had_error = False

    for book in config["books"]:
        ncode = book["ncode"]
        is_prerelease = book.get("prerelease", False)
        release_date_str = book.get("releaseDate")
        if is_prerelease and release_date_str:
            try:
                if datetime.strptime(release_date_str, "%Y-%m-%d").date() <= datetime.now(JST).date():
                    is_prerelease = False
            except ValueError:
                pass

        if is_prerelease:
            rendered_books.append(render_prerelease_book(book))
            print(f"SKIP (配信前): {ncode}", file=sys.stderr)
            continue

        try:
            print(f"Processing: {ncode} (Kakuyomu: {book['kakuyomuId']})...", file=sys.stderr)
            
            # なろうデータ取得（未公開やKASASAGIアクセス不可時は空データにフォールバック）
            try:
                kasasagi = parse_kasasagi(ncode)
                time.sleep(0.8)
                naro_cumulative = build_naro_episode_cumulative(ncode, kasasagi["periodStart"], chapter_cache)
                naro_history = build_naro_daily_history(ncode, kasasagi, daily_cache)
                time.sleep(0.8)
            except Exception as e:
                print(f"  narou fetch failed (possibly unpublished) {ncode}: {e}", file=sys.stderr)
                kasasagi = empty_kasasagi()
                naro_cumulative = []
                naro_history = []

            # カクヨムデータ取得
            try:
                kakuyomu = parse_kakuyomu(book["kakuyomuId"])
                time.sleep(0.8)
                kakuyomu_daily = track_kakuyomu_daily(book["kakuyomuId"], kakuyomu["totalPv"], kakuyomu_daily_cache)
            except Exception as e:
                print(f"  kakuyomu fetch failed {book['kakuyomuId']}: {e}", file=sys.stderr)
                kakuyomu = {
                    "totalPv": 0,
                    "periodStart": None,
                    "episodes": [],
                    "episodeCheers": [],
                    "totalCheers": 0,
                }
                kakuyomu_daily = {"todayPv": 0, "dailyHistory": []}

            # カクヨム統計
            today_str = datetime.now(JST).strftime("%Y-%m-%d")
            entry = kakuyomu_stats_cache.get(book["kakuyomuId"])
            if entry and entry.get("date") == today_str:
                kakuyomu_stats = entry["stats"]
            else:
                try:
                    kakuyomu_stats = parse_kakuyomu_work_stats(book["kakuyomuId"])
                    kakuyomu_stats_cache[book["kakuyomuId"]] = {"date": today_str, "stats": kakuyomu_stats}
                except Exception as e:
                    print(f"  kakuyomu work stats failed for {ncode}: {e}", file=sys.stderr)
                    kakuyomu_stats = (entry.get("stats") if entry else {}) or {"followers": 0, "reviewAvg": None, "reviewCount": 0, "comments": 0}
            
            kakuyomu.update(kakuyomu_stats)
            narou_extra = narou_api_stats.get(ncode.lower(), {})
            rank_history = build_rank_history(ncode, rankings_auto, manual_rankings)

            rendered = render_book_data(book, kasasagi, kakuyomu, kakuyomu_daily, naro_cumulative, naro_history, narou_extra, rank_history)
            rendered_books.append(rendered)
            print(f"  OK: {ncode} (Today: Narou={sum(kasasagi['hourly']['today'])}, Kakuyomu={kakuyomu_daily['todayPv']})", file=sys.stderr)
        except Exception as e:
            had_error = True
            print(f"  FAILED: {ncode}: {e}", file=sys.stderr)
        time.sleep(0.8)

    # キャッシュ保存
    save_json_cache(CHAPTER_CACHE_PATH, chapter_cache)
    save_json_cache(DAILY_CACHE_PATH, daily_cache)
    save_json_cache(KAKUYOMU_STATS_CACHE_PATH, kakuyomu_stats_cache)
    save_json_cache(KAKUYOMU_DAILY_CACHE_PATH, kakuyomu_daily_cache)
    save_json_cache(RANKINGS_AUTO_PATH, rankings_auto)

    now = datetime.now(JST)
    last_updated = now.strftime("%Y年%m月%d日 %H:%M 時点（自動取得）")
    today_iso = now.strftime("%Y-%m-%d")

    body = "\n".join(rendered_books)
    output = f"""// ============================================================
// 小説家になろう & カクヨム PVモニタ データファイル
// （自動生成: scripts/update_data.py / 毎時自動実行）
// ============================================================

const LAST_UPDATED = {js_string(last_updated)};
const TODAY_ISO = {js_string(today_iso)};
const YEAR = {now.year};

const BOOKS = [
{body}
];
"""

    with open("data.js", "w", encoding="utf-8", newline="\n") as f:
        f.write(output)

    print(f"Wrote data.js with {len(rendered_books)} books.", file=sys.stderr)
    if had_error and not rendered_books:
        sys.exit(1)


if __name__ == "__main__":
    main()
