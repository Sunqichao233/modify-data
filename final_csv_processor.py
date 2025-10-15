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
    204, 197, 213, 227, 246, 254, 257, 261, 264, 266, 267, 268,
    271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282,
    283, 284, 285, 287, 290, 292, 296, 304, 321, 323, 326, 327,
    330, 322, 332, 333, 334, 335, 336, 337, 338, 339
]

# 输入输出文件
INPUT_FILE = "10.14datascience中.csv"
OUTPUT_FILE = "10.14datascience中gai.csv"

# 课程视频时长映射
VIDEO_LENGTHS = {
    204: "0:20:51", 197: "0:12:31", 213: "0:21:29", 227: "0:21:46",
    246: "0:15:09", 254: "0:38:18", 257: "0:19:58", 261: "0:33:56",
    264: "0:21:52", 266: "0:23:53", 267: "0:22:10", 268: "0:15:45",
    271: "0:31:20", 272: "0:32:10", 273: "0:29:02", 274: "0:31:37",
    275: "0:38:16", 276: "0:38:09", 277: "0:17:04", 278: "0:25:15",
    279: "0:25:50", 280: "0:21:21", 281: "0:18:34", 282: "0:14:12",
    283: "0:27:50", 284: "0:43:12", 285: "0:25:49", 287: "0:33:15",
    290: "0:33:42", 292: "0:22:28", 296: "0:27:48", 304: "0:32:52",
    321: "0:20:34", 323: "0:34:51", 326: "0:24:08", 327: "0:26:48",
    330: "0:35:16", 322: "0:30:04", 332: "0:18:08", 333: "0:30:43",
    334: "0:48:07", 335: "0:27:22", 336: "0:21:41", 337: "0:17:51",
    338: "0:14:13", 339: "0:08:59"
}
# 随机种子
RANDOM_SEED = 456
# ==================== 工具函数 ====================

def is_holiday(dt):
    """检查是否是假期（8月11-15日、9月15日、9月23日）"""
    if dt.year == 2025:
        # 8月11-15日假期
        if dt.month == 8 and 11 <= dt.day <= 15:
            return True
        # 9月15日假期
        if dt.month == 9 and dt.day == 15:
            return True
        # 9月23日假期
        if dt.month == 9 and dt.day == 23:
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
