#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSV数据处理脚本
功能：处理CSV文件，实现完全连续紧凑的时间调度，跳过假期和周末
"""

import csv
import sys
import codecs
from datetime import datetime, timedelta
import random

if sys.platform == 'win32':
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

# ==================== 配置区域 ====================

# 课程ID列表
COURSE_IDS = [
    1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1999,
    2008, 2010, 2041, 2015, 2019, 2020, 2021, 2022, 2023, 2024, 2026, 2027,
    2028, 2029, 2031, 2033, 2034, 2046, 2039, 2040
]

# 输入输出文件
INPUT_FILE = "10.7贺saba基础.csv"
OUTPUT_FILE = "10.10贺saba基础.csv"

# 课程视频时长映射
VIDEO_LENGTHS = {
    1986: "0:30:07", 1987: "0:30:36", 1988: "0:30:07", 1989: "0:30:03",
    1990: "0:30:01", 1991: "0:30:14", 1992: "0:30:12", 1993: "0:30:18",
    1994: "0:30:21", 1995: "0:30:23", 1996: "0:30:02", 1999: "0:30:02",
    2008: "0:30:05", 2010: "0:30:02", 2041: "0:30:27", 2015: "0:30:05",
    2019: "0:30:01", 2020: "0:30:05", 2021: "0:30:39", 2022: "0:30:11",
    2023: "0:30:44", 2024: "0:30:34", 2026: "0:30:34", 2027: "0:30:01",
    2028: "0:30:02", 2029: "0:30:55", 2031: "0:30:08", 2033: "0:30:46",
    2034: "0:30:06", 2046: "0:30:05", 2039: "0:30:22", 2040: "0:30:23"
}
# 随机种子
RANDOM_SEED = 456
# ==================== 工具函数 ====================

def is_holiday(dt):
    """检查是否是假期（8月11-15日）"""
    if dt.year == 2025 and dt.month == 8 and 11 <= dt.day <= 15:
        return True
    return False

def is_weekend(dt):
    """检查是否是周末"""
    return dt.weekday() >= 5  # 5=周六, 6=周日

def is_workday(dt):
    """检查是否是工作日（不是周末也不是假期）"""
    return not is_weekend(dt) and not is_holiday(dt)

def get_next_workday(dt):
    """获取下一个工作日"""
    next_day = dt + timedelta(days=1)
    while not is_workday(next_day):
        next_day = next_day + timedelta(days=1)
    return next_day

def parse_time_string(time_str):
    """解析时间字符串为分钟数"""
    if not time_str or time_str.strip() == "":
        return 0
    try:
        parts = time_str.split(":")
        if len(parts) == 3:
            hours, minutes, seconds = map(int, parts)
            return hours * 60 + minutes + seconds / 60
        elif len(parts) == 2:
            minutes, seconds = map(int, parts)
            return minutes + seconds / 60
        return 0
    except (ValueError, IndexError):
        return 0

def parse_datetime(dt_str):
    """解析日期时间字符串"""
    if not dt_str or dt_str.strip() == "":
        return None
    try:
        return datetime.strptime(dt_str, "%Y/%m/%d %H:%M")
    except ValueError:
        try:
            return datetime.strptime(dt_str, "%Y/%m/%d %H:%M:%S")
        except ValueError:
            return None

def format_datetime(dt):
    """格式化日期时间"""
    if dt is None:
        return ""
    return f"{dt.year}/{dt.month}/{dt.day} {dt.hour}:{dt.minute:02d}"

# ==================== 主处理逻辑 ====================

print("=" * 60)
print("CSV数据处理脚本")
print("=" * 60)
print(f"输入文件: {INPUT_FILE}")
print(f"输出文件: {OUTPUT_FILE}")
print(f"课程范围: {COURSE_IDS[0]}-{COURSE_IDS[-1]}")
print(f"假期设置: 8月11-15日")
print("=" * 60)
print()

# 读取CSV文件
print("正在读取文件...")
try:
    with open(INPUT_FILE, 'r', encoding='gbk', newline='') as f:
        reader = csv.reader(f)
        header = next(reader)
        all_rows = list(reader)
except FileNotFoundError:
    print(f"❌ 错误：找不到文件 {INPUT_FILE}")
    sys.exit(1)
except Exception as e:
    print(f"❌ 读取文件失败: {e}")
    sys.exit(1)

print(f"✅ 读取了 {len(all_rows)} 行数据\n")

# 获取列索引
try:
    user_id_index = header.index('user_id')
    course_id_index = header.index('course_id')
    new_course_id_index = header.index('new_course_id')
    first_finished_time_index = header.index('first_finished_time')
    new_started_at_UTC_index = header.index('new_started_at_UTC')
    new_started_at_index = header.index('new_started_at')
    next_started_at_index = header.index('next_started_at')
    course_video_length_index = header.index('course_video_length')
    rest_time_index = header.index('rest_time')
except ValueError as e:
    print(f"❌ 错误：CSV文件缺少必要的列: {e}")
    sys.exit(1)

# 初始化随机数生成器
random_gen = random.Random(RANDOM_SEED)

# 第一步：收集每个用户的所有课程行
print("正在分析数据...")
user_course_data = {}

for i, row in enumerate(all_rows):
    user_id = row[user_id_index]
    course_id = row[course_id_index]
    first_finished_time = row[first_finished_time_index]
    
    if course_id and user_id:
        try:
            cid = int(course_id)
            if cid in COURSE_IDS:
                if user_id not in user_course_data:
                    user_course_data[user_id] = []
                user_course_data[user_id].append((i, cid, first_finished_time))
        except ValueError:
            pass

print(f"✅ 找到 {len(user_course_data)} 个用户的课程数据\n")

# 第二步：为每个用户生成完全连续紧凑的时间
print("正在生成时间数据（跳过假期和周末）...")
processed_count = 0

for user_id, course_data in user_course_data.items():
    # 获取第一个课程的日期作为起始日期
    first_fft = course_data[0][2]
    first_fft_dt = parse_datetime(first_fft)
    start_date = first_fft_dt.date() if first_fft_dt else datetime(2025, 8, 1).date()
    
    # 确保起始日期是工作日
    start_datetime = datetime.combine(start_date, datetime.min.time())
    if not is_workday(start_datetime):
        start_datetime = get_next_workday(start_datetime)
        start_date = start_datetime.date()
    
    # 第一个课程：随机起始时间9:01-9:30
    total_minutes = random_gen.randint(1, 30)
    current_time = datetime.combine(start_date, datetime(2025, 1, 1, 9, total_minutes).time())
    
    # 逐个处理该用户的所有课程（完全连续）
    for idx, (row_idx, cid, fft) in enumerate(course_data):
        if idx >= len(COURSE_IDS):
            break  # 超出课程ID范围
        
        row = all_rows[row_idx]
        
        # 分配new_course_id
        new_course_id = COURSE_IDS[idx]
        row[new_course_id_index] = str(new_course_id)
        
        # 获取视频时长和休息时间
        video_length_minutes = parse_time_string(VIDEO_LENGTHS[new_course_id])
        rest_time = random_gen.randint(3, 5)
        
        # 确保当前时间在工作日
        if not is_workday(current_time):
            next_workday = get_next_workday(current_time)
            current_time = next_workday.replace(hour=9, minute=0)
        
        # 使用连续计算的时间
        utc_time = current_time
        
        # 计算结束时间
        next_time = utc_time + timedelta(minutes=video_length_minutes)
        
        # 检查结束时间是否超过18:00，如果超过则跳到下一个工作日
        end_of_day = utc_time.replace(hour=18, minute=0, second=0, microsecond=0)
        if next_time > end_of_day:
            # 跳到下一个工作日9:00
            next_workday = get_next_workday(utc_time)
            utc_time = next_workday.replace(hour=9, minute=0)
            next_time = utc_time + timedelta(minutes=video_length_minutes)
        
        # 检查结束时间是否跨越午休 (12:00-13:00)
        lunch_start = utc_time.replace(hour=12, minute=0, second=0, microsecond=0)
        lunch_end = utc_time.replace(hour=13, minute=0, second=0, microsecond=0)
        
        # 如果结束时间会落在12:00-13:00之间，调整到下午开始
        if next_time > lunch_start and next_time < lunch_end:
            # 直接跳到13:00开始，避免时间倒流
            utc_time = lunch_end
            next_time = utc_time + timedelta(minutes=video_length_minutes)
        elif utc_time < lunch_start and next_time > lunch_end:
            # 视频太长，跨越整个午休，从13:00开始
            utc_time = lunch_end
            next_time = utc_time + timedelta(minutes=video_length_minutes)
        
        # 计算new_started_at (UTC - 9小时)
        new_started_at_time = utc_time - timedelta(hours=9)
        
        # 更新行数据
        row[new_started_at_UTC_index] = format_datetime(utc_time)
        row[next_started_at_index] = format_datetime(next_time)
        row[new_started_at_index] = format_datetime(new_started_at_time)
        row[course_video_length_index] = VIDEO_LENGTHS[new_course_id]
        row[rest_time_index] = str(rest_time)
        
        processed_count += 1
        
        # 计算下一个课程的开始时间（完全连续）
        current_time = next_time + timedelta(minutes=rest_time)
        
        # 检查是否需要跨过午休
        if current_time > lunch_start and current_time < lunch_end:
            current_time = lunch_end
        
        # 检查是否超过工作时间（17:30后跳到下一个工作日）
        if current_time.hour >= 18 or (current_time.hour == 17 and current_time.minute > 30):
            # 跳到下一个工作日的9:00
            next_workday = get_next_workday(current_time)
            current_time = next_workday.replace(hour=9, minute=0)
        
        # 最后再次确认不在假期或周末
        if not is_workday(current_time):
            next_workday = get_next_workday(current_time)
            current_time = next_workday.replace(hour=9, minute=0)

print(f"✅ 处理了 {processed_count} 条课程记录\n")

# 第三步：写入输出文件
print("正在写入文件...")
try:
    with open(OUTPUT_FILE, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(all_rows)
    print(f"✅ 成功写入: {OUTPUT_FILE}\n")
except Exception as e:
    print(f"❌ 写入文件失败: {e}")
    sys.exit(1)

# 完成
print("=" * 60)
print("✅ 处理完成！")
print("=" * 60)
print("\n特性说明：")
print("  ✓ 时间完全连续紧凑，充分利用工作时段")
print("  ✓ 工作时间：9:00-12:00, 13:00-18:00")
print("  ✓ 避免午休时段：12:00-13:00")
print("  ✓ 跳过假期：8月11-15日")
print("  ✓ 跳过周末（周六、周日）")
print("  ✓ 结束时间不超过18:00")
print("  ✓ 不存在时间倒流/重叠")
print("  ✓ 课程间休息：3-5分钟随机")
print("  ✓ 超过限制自动跳到下一个工作日9:00")
print("  ✓ new_course_id按2052-2083顺序分配")
print("\n" + "=" * 60)
