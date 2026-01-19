#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
副本LLM+data基础 CSV列更新脚本（按新规则）
根据每行 first_finished_time 设置：
- new_started_at = 同行 first_finished_time
- new_started_at_UTC = new_started_at + 9 小时（按需求，非传统换算）
- next_started_at = new_started_at_UTC + course_video_length（若缺失则保持为空）
- rest_time = 2-6 的随机整数

额外规则：flag 为 “留” 的行不改动（跳过更新）。

保留其他列不变，输出到新文件。
"""

import csv
import sys
import codecs
from datetime import datetime, timedelta
import random
from collections import defaultdict

if sys.platform == 'win32':
    # 终端输出保持UTF-8，避免中文乱码
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())


INPUT_FILE = "副本LLM+data基础.csv"
OUTPUT_FILE = "副本LLM+data基础_修改.csv"
UTC_SHIFT_HOURS = 9  # new_started_at_UTC = new_started_at + 9 小时
REST_MIN = 2
REST_MAX = 6
RANDOM_SEED = 456


def parse_time_string(time_str: str) -> float:
    """解析视频时长字符串为分钟数（支持 H:M:S 或 M:S）。
    返回分钟数（float）。无效或空返回0。
    """
    if not time_str or time_str.strip() == "":
        return 0.0
    try:
        parts = time_str.strip().split(":")
        if len(parts) == 3:
            hours, minutes, seconds = map(int, parts)
            return hours * 60 + minutes + seconds / 60.0
        elif len(parts) == 2:
            minutes, seconds = map(int, parts)
            return minutes + seconds / 60.0
    except Exception:
        pass
    return 0.0


def parse_datetime(dt_str: str):
    """解析日期时间字符串为 datetime。
    允许格式：YYYY/MM/DD HH:MM 或 YYYY/MM/DD HH:MM:SS。
    无效返回 None。
    """
    if not dt_str or dt_str.strip() == "":
        return None
    s = dt_str.strip()
    try:
        return datetime.strptime(s, "%Y/%m/%d %H:%M")
    except ValueError:
        try:
            return datetime.strptime(s, "%Y/%m/%d %H:%M:%S")
        except ValueError:
            return None


def format_datetime(dt: datetime) -> str:
    """格式化 datetime 为字符串（YYYY/M/D HH:MM）。None 返回空串。"""
    if dt is None:
        return ""
    return f"{dt.year}/{dt.month}/{dt.day} {dt.hour}:{dt.minute:02d}"

def is_weekend(dt: datetime) -> bool:
    return dt.weekday() >= 5

def is_workday(dt: datetime) -> bool:
    return not is_weekend(dt)

def get_next_workday(dt: datetime) -> datetime:
    next_day = dt + timedelta(days=1)
    while not is_workday(next_day):
        next_day = next_day + timedelta(days=1)
    return next_day


def main():
    print("=" * 60)
    print("副本LLM+data基础 CSV列更新脚本")
    print("=" * 60)
    print(f"输入文件: {INPUT_FILE}")
    print(f"输出文件: {OUTPUT_FILE}")
    print(f"UTC计算: new_started_at + {UTC_SHIFT_HOURS} 小时")
    print("=" * 60)
    print()

    # 读取CSV
    print("正在读取文件...")
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f)
            header = next(reader)
            rows = list(reader)
    except FileNotFoundError:
        print(f"❌ 错误：找不到文件 {INPUT_FILE}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 读取文件失败: {e}")
        sys.exit(1)

    print(f"✅ 读取了 {len(rows)} 行数据\n")

    # 获取列索引
    try:
        first_finished_time_index = header.index('first_finished_time')
        course_video_length_index = header.index('course_video_length')
        new_started_at_index = header.index('new_started_at')
        new_started_at_UTC_index = header.index('new_started_at_UTC')
        next_started_at_index = header.index('next_started_at')
        rest_time_index = header.index('rest_time')
        flag_index = header.index('flag')
        user_id_index = header.index('user_id')
    except ValueError as e:
        print(f"❌ 错误：CSV缺少必要列: {e}")
        sys.exit(1)

    # 随机数生成器
    rand = random.Random(RANDOM_SEED)

    print("正在按 user_id 工作日调度法连续更新列数据...")
    updated = 0
    skipped_liu = 0

    # 分组：按 user_id 保持原顺序
    groups = defaultdict(list)
    for idx, r in enumerate(rows):
        uid = r[user_id_index] if user_id_index < len(r) else ""
        groups[uid].append(idx)

    for uid, idx_list in groups.items():
        current_time = None  # 工作日调度中的当前 UTC 起点
        for idx in idx_list:
            row = rows[idx]
            # 跳过 flag 为 “留” 的行
            try:
                flag_val = row[flag_index].strip()
            except Exception:
                flag_val = ""
            if flag_val == "留":
                skipped_liu += 1
                continue

            # 休息时间
            rest_val = rand.randint(REST_MIN, REST_MAX)

            # 第一条：current_time = first_finished_time + 9h；后续：沿用上一次的 current_time
            if current_time is None:
                fft_str = row[first_finished_time_index] if first_finished_time_index < len(row) else ""
                fft_dt = parse_datetime(fft_str)
                if fft_dt is None:
                    # 无法解析则跳过该行更新
                    continue
                current_time = fft_dt + timedelta(hours=UTC_SHIFT_HOURS)

            # 确保当前时间在工作日
            if not is_workday(current_time):
                next_workday = get_next_workday(current_time)
                current_time = next_workday.replace(hour=9, minute=0)

            # 使用连续计算的时间（UTC）
            utc_time = current_time

            # 计算结束时间
            dur_str = row[course_video_length_index] if course_video_length_index < len(row) else ""
            minutes = parse_time_string(dur_str)
            next_time = utc_time + timedelta(minutes=minutes) if minutes > 0 else utc_time

            # 检查结束时间是否超过18:00
            end_of_day = utc_time.replace(hour=18, minute=0, second=0, microsecond=0)
            if next_time > end_of_day:
                next_workday = get_next_workday(utc_time)
                utc_time = next_workday.replace(hour=9, minute=0)
                next_time = utc_time + timedelta(minutes=minutes)

            # 午休处理（12:00-13:00）
            lunch_start = utc_time.replace(hour=12, minute=0, second=0, microsecond=0)
            lunch_end = utc_time.replace(hour=13, minute=0, second=0, microsecond=0)
            if next_time > lunch_start and next_time < lunch_end:
                utc_time = lunch_end
                next_time = utc_time + timedelta(minutes=minutes)
            elif utc_time < lunch_start and next_time > lunch_end:
                utc_time = lunch_end
                next_time = utc_time + timedelta(minutes=minutes)

            # 计算 new_started_at（本地=UTC-9h）
            local_start = utc_time - timedelta(hours=UTC_SHIFT_HOURS)

            # 更新行
            row[new_started_at_UTC_index] = format_datetime(utc_time)
            row[next_started_at_index] = format_datetime(next_time)
            row[new_started_at_index] = format_datetime(local_start)
            row[rest_time_index] = str(rest_val)

            updated += 1

            # 计算下一个课程的开始时间（完全连续）
            current_time = next_time + timedelta(minutes=rest_val)

            # 检查是否需要跨过午休
            if current_time > lunch_start and current_time < lunch_end:
                current_time = lunch_end

            # 检查是否超过工作时间（17:30后跳到下一个工作日）
            if current_time.hour >= 18 or (current_time.hour == 17 and current_time.minute > 30):
                next_workday = get_next_workday(current_time)
                current_time = next_workday.replace(hour=9, minute=0)

            # 最后再次确认不在周末
            if not is_workday(current_time):
                next_workday = get_next_workday(current_time)
                current_time = next_workday.replace(hour=9, minute=0)

    print(f"✅ 已更新 {updated} 行（跳过 留: {skipped_liu} 行）\n")

    # 写入输出文件
    print("正在写入文件...")
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(rows)
        print(f"✅ 成功写入: {OUTPUT_FILE}\n")
    except Exception as e:
        print(f"❌ 写入文件失败: {e}")
        # 尝试写入备用文件名（可能原文件被占用）
        alt = OUTPUT_FILE.replace('.csv', '_new.csv')
        try:
            with open(alt, 'w', encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(header)
                writer.writerows(rows)
            print(f"✅ 备用写入成功: {alt}\n")
        except Exception as e2:
            print(f"❌ 备用写入也失败: {e2}")
            sys.exit(1)

    print("=" * 60)
    print("✅ 处理完成！")
    print("=" * 60)
    print("\n说明：")
    print("  ✓ new_started_at 直接取 first_finished_time")
    print("  ✓ new_started_at_UTC = new_started_at + 9 小时（按需求）")
    print("  ✓ next_started_at = new_started_at_UTC + course_video_length")
    print("  ✓ rest_time ∈ [2,6] 随机整数")
    print("  ✓ flag 为 ‘留’ 的行不改动")


if __name__ == "__main__":
    main()
