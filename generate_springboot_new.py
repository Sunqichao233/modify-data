#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
根据“副本springboot新增.csv”生成 22 条新数据：
- 复制 video_id、course_id、course_video_length，使 22 条都一致（来自基准行）
- 第 1 条的 new_started_at_UTC：随机选取截止日前的任意工作日的时间段
- 之后每条：
  new_started_at_UTC = 依据 Excel 规则，从上一条 next_started_at + 上一条 rest_time 推导；
  如果超出 16:30，跳到下一个工作日 9:00(+0-30min) 或 13:00(+0-60min)
- next_started_at = new_started_at_UTC + course_video_length
- rest_time 为 2-6（分钟）随机，每条都生成；第 n+1 条使用第 n 条的 rest_time 作为间隔

使用：
  python generate_springboot_new.py --input "副本springboot新增.csv" \
    --output "副本springboot新增_生成22.csv" --count 22 --cutoff "2025/12/12"
可通过 --base-index 指定作为基准的行（具有 video_id、course_id 的行）。
"""

import csv
import sys
import codecs
import argparse
from datetime import datetime, timedelta, time, date
import random
from typing import Optional, Tuple


if sys.platform == 'win32':
    try:
        sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
    except Exception:
        pass


# 列名常量（与 CSV 表头保持一致）
COLUMNS = [
    'id','disabled','seq','verify','update_time','create_time','playing_time','is_finished',
    'user_id','video_id','course_id','first_finished_time','started_at','flag','new_course_id',
    'course_video_length','new_started_at','new_started_at_UTC','next_started_at','rest_time'
]


def parse_hms_to_minutes(hms: str) -> float:
    """将形如 '0:30:02' 或 '0:30:41' 的时长解析为分钟数（含秒）"""
    if not hms:
        return 0.0
    try:
        parts = hms.split(':')
        if len(parts) == 3:
            h, m, s = map(int, parts)
            return h * 60 + m + s / 60.0
        elif len(parts) == 2:
            m, s = map(int, parts)
            return m + s / 60.0
    except Exception:
        pass
    return 0.0


def format_dt(dt: datetime) -> str:
    """格式化为 'YYYY/MM/DD HH:MM' 文本"""
    return f"{dt.year}/{dt.month}/{dt.day} {dt.hour}:{dt.minute:02d}"


def is_weekday(d: date) -> bool:
    return d.weekday() < 5  # 0-4 是周一到周五


def next_workday(base: datetime) -> datetime:
    """返回下一个工作日的 00:00 时间点"""
    d = base.date() + timedelta(days=1)
    while not is_weekday(d):
        d = d + timedelta(days=1)
    return datetime.combine(d, time(0, 0))


def pick_random_worktime_before(cutoff: date, rng: random.Random) -> datetime:
    """随机选择截止日前（不含）任意工作日的时间：
    - 上午 9:00–10:30（随机分钟）或
    - 下午 13:00–16:30（随机分钟）
    """
    # 从 cutoff 往前最多退 30 天寻找工作日
    candidates = []
    for i in range(1, 31):
        d = cutoff - timedelta(days=i)
        if is_weekday(d):
            candidates.append(d)
    if not candidates:
        # 若找不到，直接用 cutoff 前一天
        d = cutoff - timedelta(days=1)
        if d.weekday() >= 5:
            # 调整到最近的工作日（往前找）
            while d.weekday() >= 5:
                d = d - timedelta(days=1)
        candidates = [d]

    chosen = rng.choice(candidates)
    if rng.randint(0, 1) == 0:  # 上午
        minute = rng.randint(0, 90)  # 0..90 分钟
        base = datetime.combine(chosen, time(9, 0))
        return base + timedelta(minutes=minute)
    else:  # 下午
        minute = rng.randint(0, 210)  # 0..210 分钟（13:00→16:30）
        base = datetime.combine(chosen, time(13, 0))
        return base + timedelta(minutes=minute)


def apply_excel_like_rule(prev_next_started_at: datetime, prev_rest_min: int, rng: random.Random) -> datetime:
    """实现题述 Excel 规则，得到本行 new_started_at_UTC：
    以 candidate = prev_next_started_at + prev_rest_min。
    - 若 candidate 的时分 >= 16:30 → 下个工作日 9:00(+0..30) 或 13:00(+0..60)
    - 若 HOUR(candidate) < 9 → 当天 9:00
    - 若 10:30 ≤ candidate < 13:00 → 当天 13:00 + 0..60
    - 否则 → candidate
    同时处理周末：如果命中周末，则移动到下一工作日 9:00(+0..30) 或 13:00(+0..60)
    """
    candidate = prev_next_started_at + timedelta(minutes=prev_rest_min)

    def _pick_next_day_start(d: date) -> datetime:
        # 选择 9:00(+0..30) 或 13:00(+0..60)
        if rng.randint(0, 1) == 0:
            return datetime.combine(d, time(9, 0)) + timedelta(minutes=rng.randint(0, 30))
        else:
            return datetime.combine(d, time(13, 0)) + timedelta(minutes=rng.randint(0, 60))

    # 如果是周末，直接跳到下一个工作日
    if candidate.weekday() >= 5:
        nd = candidate.date()
        while nd.weekday() >= 5:
            nd = nd + timedelta(days=1)
        return _pick_next_day_start(nd)

    hm_val = candidate.hour + candidate.minute / 60.0

    # >= 16:30 → 下一工作日
    if hm_val >= 16.5:
        nd = next_workday(candidate).date()
        return _pick_next_day_start(nd)

    # < 9 → 当天 9:00
    if candidate.hour < 9:
        d = candidate.date()
        return datetime.combine(d, time(9, 0))

    # [10:30, 13:00) → 当天 13:00 + 随机 0..60
    t_1030 = time(10, 30)
    t_1300 = time(13, 0)
    if t_1030 <= candidate.time() < t_1300:
        d = candidate.date()
        return datetime.combine(d, time(13, 0)) + timedelta(minutes=rng.randint(0, 60))

    # 其他 → candidate
    return candidate


def pick_base_row(rows, header_norm, base_index: Optional[int]) -> Tuple[int, dict]:
    """选择具有 video_id、course_id、course_video_length 的行作为基准；返回其索引和字典。
    仅依赖必须列，兼容输入缺少其它列的情况。
    """
    # 仅构造必须列索引
    # 仅需要 video_id 与 course_id；课程时长从 --lengths 或 CSV 单独读取
    required = ['video_id', 'course_id']
    idx_map = {}
    for name in required:
        try:
            idx_map[name] = header_norm.index(name)
        except ValueError as e:
            raise RuntimeError(f"输入缺少必要列: {name}") from e

    candidates = []
    for i, r in enumerate(rows):
        vid = r[idx_map['video_id']]
        cid = r[idx_map['course_id']]
        if vid and cid:
            candidates.append((i, r))

    if not candidates:
        raise RuntimeError("未在输入文件中找到包含 video_id、course_id、course_video_length 的行")

    if base_index is not None:
        if base_index < 0 or base_index >= len(candidates):
            raise IndexError(f"base_index 越界（0..{len(candidates)-1}）")
        idx, row = candidates[base_index]
    else:
        idx, row = candidates[0]

    # 组装为 dict（仅必要字段）
    data = {
        'video_id': row[idx_map['video_id']],
        'course_id': row[idx_map['course_id']],
    }
    return idx, data


def _parse_list(text: Optional[str]) -> list:
    if not text:
        return []
    raw = text.replace('\n', ' ').replace('\t', ' ').replace(',', ' ')
    return [tok.strip() for tok in raw.split() if tok.strip()]


def main():
    parser = argparse.ArgumentParser(description='生成 22 份数据，每份32条（组间空行）')
    parser.add_argument('--input', default='副本springboot新增.csv')
    parser.add_argument('--output', default='副本springboot新增_生成22.csv')
    # 兼容旧含义：此前 --count 表示总行数；现在优先使用 --sets 表示份数
    parser.add_argument('--sets', type=int, default=22, help='生成份数，默认22')
    parser.add_argument('--count', type=int, default=None, help='兼容参数；若提供则视为份数')
    parser.add_argument('--cutoff', default='2025/12/12', help='截止日期，形如 2025/12/12')
    parser.add_argument('--seed', type=int, default=1234)
    parser.add_argument('--video-ids', default=None, help='32个video_id，逗号或空白分隔；若缺省则从CSV读取')
    parser.add_argument('--course-ids', default=None, help='与video_id一一对应；若缺省则从CSV映射')
    parser.add_argument('--lengths', default=None, help='32个课程时长（h:m:s），逗号或空白分隔；缺省则从CSV读取')

    args = parser.parse_args()

    rng = random.Random(args.seed)

    # 读取 CSV
    # 使用 utf-8-sig 读取，自动去除 BOM；并兼容表头名中的空白
    with open(args.input, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    # 规范化表头（去 BOM/空白）
    def norm_name(s: str) -> str:
        return (s or '').replace('\ufeff', '').strip()
    header_norm = [norm_name(h) for h in header]

    # 校验表头
    # 仅强制要求输入中必须存在的列（用于复制与计算）
    required_in = ['video_id', 'course_id']
    missing = [c for c in required_in if c not in header_norm]
    if missing:
        raise RuntimeError(f"CSV 缺少必要列: {missing}")

    # 构建 video_id 列表（32个）
    default_video_ids = [
        '29055','29057','29059','29061','29063','29065','29067','29069',
        '29071','29073','29075','29077','29079','29081','29083','29085',
        '29087','29089','29091','29093','29095','29097','29099','29101',
        '29103','29105','29107','29109','29111','29113','29115','29117'
    ]

    vid_list = _parse_list(args.video_ids)
    if not vid_list:
        vid_list = default_video_ids

    # 从 CSV 映射 course_id：对每个 video_id 找到对应 course_id
    idx_vid = header_norm.index('video_id')
    idx_cid = header_norm.index('course_id')
    idx_len = header_norm.index('course_video_length') if 'course_video_length' in header_norm else None
    # 构建映射字典
    vid_to_cid = {}
    vid_to_len = {}
    for r in rows:
        v = r[idx_vid].strip() if idx_vid < len(r) and r[idx_vid] else ''
        c = r[idx_cid].strip() if idx_cid < len(r) and r[idx_cid] else ''
        l = r[idx_len].strip() if idx_len is not None and idx_len < len(r) and r[idx_len] else ''
        if v:
            if c:
                vid_to_cid[v] = c
            if l:
                vid_to_len[v] = l

    # 课程ID列表：优先用 --course-ids，否则用CSV映射
    cid_list = _parse_list(args.course_ids)
    if cid_list:
        if len(cid_list) != len(vid_list):
            raise RuntimeError('course-ids 数量需与 video-ids 一致')
    else:
        cid_list = []
        for v in vid_list:
            if v not in vid_to_cid:
                raise RuntimeError(f'CSV中未找到 video_id={v} 的对应 course_id')
            cid_list.append(vid_to_cid[v])

    # 课程时长列表：优先用 --lengths，否则按 video_id 从CSV映射
    if args.lengths:
        lengths_strs = _parse_list(args.lengths)
        if len(lengths_strs) != len(vid_list):
            raise RuntimeError('lengths 数量需与 video-ids 一致（通常为32）')
    else:
        lengths_strs = []
        if idx_len is None:
            raise RuntimeError('CSV 缺少列 course_video_length，且未提供 --lengths')
        for v in vid_list:
            if v not in vid_to_len:
                raise RuntimeError(f'CSV中未找到 video_id={v} 的课程时长 course_video_length')
            lengths_strs.append(vid_to_len[v])

    cutoff_dt = datetime.strptime(args.cutoff, "%Y/%m/%d").date()

    # 份数确定
    sets_count = args.sets if args.count is None else args.count

    def make_row_template():
        return {name: '' for name in header_norm}

    out_rows = []
    for s in range(sets_count):
        # 每份的第一条：随机工作日时间（在截止日前）
        first_start_utc = pick_random_worktime_before(cutoff_dt, rng)
        first_len_min = parse_hms_to_minutes(lengths_strs[0])
        first_next = first_start_utc + timedelta(minutes=first_len_min)
        first_rest = rng.randint(2, 6)

        # 第1条
        r1 = make_row_template()
        r1['disabled'] = '0'
        r1['seq'] = '0'
        r1['verify'] = '0'
        r1['is_finished'] = '0'
        r1['video_id'] = vid_list[0]
        r1['course_id'] = cid_list[0]
        r1['course_video_length'] = lengths_strs[0]
        r1['new_started_at_UTC'] = format_dt(first_start_utc)
        r1['next_started_at'] = format_dt(first_next)
        r1['rest_time'] = str(first_rest)

        out_row1 = [''] * len(header)
        for i, col in enumerate(header_norm):
            out_row1[i] = r1.get(col, '')
        out_rows.append(out_row1)

        prev_next = first_next
        prev_rest = first_rest

        # 后续31条，逐行按Excel规则推进
        for j in range(1, len(vid_list)):
            start_utc = apply_excel_like_rule(prev_next, prev_rest, rng)
            row_len_min = parse_hms_to_minutes(lengths_strs[j])
            next_utc = start_utc + timedelta(minutes=row_len_min)
            rest = rng.randint(2, 6)

            r = make_row_template()
            r['disabled'] = '0'
            r['seq'] = '0'
            r['verify'] = '0'
            r['is_finished'] = '0'
            r['video_id'] = vid_list[j]
            r['course_id'] = cid_list[j]
            r['course_video_length'] = lengths_strs[j]
            r['new_started_at_UTC'] = format_dt(start_utc)
            r['next_started_at'] = format_dt(next_utc)
            r['rest_time'] = str(rest)

            out_row = [''] * len(header)
            for i, col in enumerate(header_norm):
                out_row[i] = r.get(col, '')
            out_rows.append(out_row)

            prev_next = next_utc
            prev_rest = rest

        # 组之间空一行（最后一组之后不再插入）
        if s != sets_count - 1:
            out_rows.append([''] * len(header))

    # 写出 CSV
    with open(args.output, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(out_rows)

    print(f"✅ 已生成 {sets_count} 份，每份 {len(vid_list)} 条，共 {len(out_rows)} 行到 {args.output}")


if __name__ == '__main__':
    main()
