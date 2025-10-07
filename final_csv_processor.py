#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSV数据处理最终版本脚本
功能：对CSV文件进行复杂的时间计算和数据修改
作者：AI Assistant
版本：1.0
日期：2025年10月
"""

import csv
import os
import sys
import codecs
from datetime import datetime, timedelta
import random

# Windows控制台UTF-8编码支持
if sys.platform == 'win32':
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

# ========= 配置区域 =========
INPUT_FILE = "10.7贺saba基础.csv"
OUTPUT_FILE = "10.7_saba_processed.csv"
RANDOM_SEED = 456  # 固定随机种子确保结果可重现

# 课程ID列表（按顺序）
COURSE_IDS = [
    1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1999, 
    2008, 2010, 2041, 2015, 2019, 2020, 2021, 2023, 2024, 2026, 2027, 2028, 
    2029, 2022, 2031, 2033, 2034, 2046, 2039, 2040
]

# 课程视频时长数据（与COURSE_IDS对应）
VIDEO_LENGTHS = [
    "0:30:07", "0:30:36", "0:30:07", "0:30:03", "0:30:01", "0:30:14", "0:30:12", "0:30:18",
    "0:30:21", "0:30:23", "0:30:02", "0:30:02", "0:30:05", "0:30:02", "0:30:27", "0:30:05",
    "0:30:01", "0:30:05", "0:30:39", "0:30:11", "0:30:44", "0:30:34", "0:30:34", "0:30:01",
    "0:30:02", "0:30:55", "0:30:08", "0:30:46", "0:30:06", "0:30:05", "0:30:22", "0:30:23"
]

# 创建课程ID到视频时长的映射
COURSE_VIDEO_MAP = dict(zip(COURSE_IDS, VIDEO_LENGTHS))

# 特殊起始日期用户（可根据需要修改）
SPECIAL_START_DATES = {
    # user_id: (year, month, day, hour, minute)
    # 示例：'1004598': (2025, 8, 7, 9, 19),
    # 示例：'1004609': (2025, 8, 18, 9, 39),
    # 示例：'1004612': (2025, 8, 19, 9, 24),
}

# ===========================

class CSVProcessor:
    """CSV数据处理器"""
    
    def __init__(self):
        self.random = random.Random(RANDOM_SEED)
        self.processed_stats = {
            'total_rows': 0,
            'flag_updated': 0,
            'new_course_id_added': 0,
            'video_length_added': 0,
            'rest_time_added': 0,
            'utc_time_set': 0,
            'next_started_at_updated': 0,
            'new_started_at_utc_updated': 0,
            'new_started_at_added': 0
        }
    
    def log(self, message):
        """输出日志信息"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
    
    def parse_datetime(self, dt_str):
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
    
    def format_datetime(self, dt):
        """格式化日期时间"""
        if dt is None:
            return ""
        return f"{dt.year}/{dt.month}/{dt.day} {dt.hour}:{dt.minute:02d}"
    
    def parse_time_string(self, time_str):
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
    
    def is_workday(self, dt):
        """判断是否为工作日（周一到周五，排除8月11-15日、9月15日、9月23日假期）"""
        if dt.weekday() >= 5:  # 周六、周日
            return False
        if dt.year == 2025 and dt.month == 8 and 11 <= dt.day <= 15:
            return False
        if dt.year == 2025 and dt.month == 9 and dt.day in [15, 23]:
            return False
        return True
    
    def next_workday(self, dt):
        """获取下一个工作日"""
        next_day = dt + timedelta(days=1)
        while not self.is_workday(next_day):
            next_day += timedelta(days=1)
        return next_day
    
    def apply_complex_formula(self, base_time):
        """
        应用复杂的Excel公式逻辑
        base_time: 前一行的next_started_at + rest_time
        """
        if base_time is None:
            return None
        
        # 获取日期部分
        d = base_time.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # 计算小时+分钟/60
        hour_decimal = base_time.hour + base_time.minute / 60.0
        
        # 主要逻辑：IF(HOUR(sp) + MINUTE(sp)/60 >= 16.5, ...)
        if hour_decimal >= 16.5:  # 如果超过16:30
            # WORKDAY(s,1) = 下一个工作日
            next_work = self.next_workday(base_time)
            
            # RANDBETWEEN(0,1)=0 随机选择
            if self.random.randint(0, 1) == 0:
                # 下一个工作日 9:00 + 0-30分钟随机
                return next_work.replace(hour=9, minute=0) + timedelta(minutes=self.random.randint(0, 30))
            else:
                # 下一个工作日 13:00 + 0-60分钟随机
                return next_work.replace(hour=13, minute=0) + timedelta(minutes=self.random.randint(0, 60))
        else:
            # IF(HOUR(sp) < 9, ...)
            if base_time.hour < 9:  # 如果早于9:00
                # d + TIME(9,0,0) = 当天9:00
                return d.replace(hour=9, minute=0)
            else:
                # 检查是否在10:30-13:00之间（午休时间）
                base_time_only = base_time.time()
                morning_end = datetime.strptime("10:30", "%H:%M").time()
                afternoon_start = datetime.strptime("13:00", "%H:%M").time()
                
                if base_time_only >= morning_end and base_time_only < afternoon_start:
                    # 午休时间，跳转到13:00-14:00
                    return d.replace(hour=13, minute=0) + timedelta(minutes=self.random.randint(0, 60))
                else:
                    # 正常工作时间，直接使用计算结果
                    return base_time
    
    def generate_random_start_time(self, user_id):
        """为2052行生成随机开始时间"""
        # 检查是否有特殊设置
        if user_id in SPECIAL_START_DATES:
            year, month, day, hour, minute = SPECIAL_START_DATES[user_id]
            return datetime(year, month, day, hour, minute)
        
        # 随机选择日期：8月1日、4日、5日
        dates = [(2025, 8, 1), (2025, 8, 4), (2025, 8, 5)]
        year, month, day = self.random.choice(dates)
        
        # 随机时间：9:01-10:01
        hour = 9
        minute = self.random.randint(1, 61)
        if minute > 60:
            hour = 10
            minute = minute - 60
        
        return datetime(year, month, day, hour, minute)
    
    def process_csv(self, input_file, output_file):
        """处理CSV文件的主函数"""
        self.log(f"开始处理文件: {input_file}")
        
        if not os.path.exists(input_file):
            self.log(f"错误：文件 {input_file} 不存在")
            return False
        
        # 读取CSV文件
        rows = []
        with open(input_file, 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f)
            header = next(reader)
            
            # 查找列索引
            try:
                course_id_index = header.index('course_id')
                user_id_index = header.index('user_id')
                flag_index = header.index('flag')
                first_finished_time_index = header.index('first_finished_time')
            except ValueError as e:
                self.log(f"错误：找不到必需的列 - {e}")
                return False
            
            # 添加新列（如果不存在）
            new_columns = ['new_course_id', 'course_video_length', 'rest_time', 
                          'new_started_at_UTC', 'next_started_at', 'new_started_at']
            
            for col in new_columns:
                if col not in header:
                    header.append(col)
            
            # 获取新列的索引
            new_course_id_index = header.index('new_course_id')
            course_video_length_index = header.index('course_video_length')
            rest_time_index = header.index('rest_time')
            new_started_at_utc_index = header.index('new_started_at_UTC')
            next_started_at_index = header.index('next_started_at')
            new_started_at_index = header.index('new_started_at')
            
            rows.append(header)
            
            # 读取所有数据行
            all_rows = []
            for row in reader:
                # 确保行有足够的列
                while len(row) < len(header):
                    row.append("")
                all_rows.append(row)
            
            self.processed_stats['total_rows'] = len(all_rows)
            
            # 第一阶段：基础数据修改
            self.log("第一阶段：处理基础列修改...")
            for row in all_rows:
                try:
                    course_id = int(row[course_id_index]) if row[course_id_index] else 0
                    
                    # 1. Flag列修改（写日文的留字）
                    if course_id not in COURSE_IDS:
                        if "留" not in row[flag_index]:
                            row[flag_index] = row[flag_index] + "留" if row[flag_index] else "留"
                            self.processed_stats['flag_updated'] += 1
                    
                    # 2. New_course_id列
                    if "留" not in row[flag_index] and row[course_id_index]:
                        row[new_course_id_index] = row[course_id_index]
                        self.processed_stats['new_course_id_added'] += 1
                    
                    # 3. Course_video_length列
                    if course_id in COURSE_VIDEO_MAP:
                        row[course_video_length_index] = COURSE_VIDEO_MAP[course_id]
                        self.processed_stats['video_length_added'] += 1
                        
                        # 4. Rest_time列
                        row[rest_time_index] = str(self.random.randint(3, 5))
                        self.processed_stats['rest_time_added'] += 1
                
                except (ValueError, IndexError):
                    continue
            
            # 第二阶段：时间计算
            self.log("第二阶段：处理时间计算...")
            
            # 按user_id分组并按COURSE_IDS顺序排序
            user_groups = {}
            for i, row in enumerate(all_rows):
                try:
                    course_id = int(row[course_id_index]) if row[course_id_index] else 0
                    user_id = row[user_id_index] if row[user_id_index] else ""
                    if course_id in COURSE_IDS and user_id:
                        if user_id not in user_groups:
                            user_groups[user_id] = []
                        user_groups[user_id].append((i, row, course_id))
                except (ValueError, IndexError):
                    pass
            
            # 对每个用户组内的数据按COURSE_IDS中的顺序排序
            for user_id in user_groups:
                user_groups[user_id].sort(key=lambda x: COURSE_IDS.index(x[2]) if x[2] in COURSE_IDS else 999)
            
            # 链式计算逻辑
            for user_id in sorted(user_groups.keys()):
                self.log(f"处理用户ID: {user_id}")
                user_data = user_groups[user_id]
                
                # 存储当前用户组内前一行的next_started_at时间
                prev_next_time = None
                
                for i, (row_index, row, course_id) in enumerate(user_data):
                    course_video_length_str = row[course_video_length_index]
                    video_length_minutes = self.parse_time_string(course_video_length_str)
                    rest_time_str = row[rest_time_index]
                    rest_time_minutes = int(rest_time_str) if rest_time_str and rest_time_str.isdigit() else 0
                    
                    # 获取first_finished_time的日期
                    first_finished_str = row[first_finished_time_index]
                    first_finished_dt = self.parse_datetime(first_finished_str)
                    target_date = first_finished_dt.date() if first_finished_dt else datetime(2025, 8, 1).date()
                    
                    if course_id == COURSE_IDS[0]:
                        # 第一个课程: 生成随机开始时间
                        utc_time = self.generate_random_start_time(user_id)
                        # 使用first_finished_time的日期，保留生成的时间
                        utc_time = datetime.combine(target_date, utc_time.time())
                        row[new_started_at_utc_index] = self.format_datetime(utc_time)
                        self.processed_stats['utc_time_set'] += 1
                        
                        # 计算next_started_at
                        if video_length_minutes > 0:
                            next_time = utc_time + timedelta(minutes=video_length_minutes)
                            row[next_started_at_index] = self.format_datetime(next_time)
                            prev_next_time = next_time
                            self.processed_stats['next_started_at_updated'] += 1
                        
                        # 计算new_started_at = new_started_at_UTC - 9小时
                        new_started_at_time = utc_time - timedelta(hours=9)
                        row[new_started_at_index] = self.format_datetime(new_started_at_time)
                        self.processed_stats['new_started_at_added'] += 1
                    
                    else:  # 其他课程
                        # 使用前一行的next_started_at + 当前行的rest_time作为基础
                        if prev_next_time is None:
                            base_time = datetime(2025, 8, 1, 9, 0)
                        else:
                            base_time = prev_next_time + timedelta(minutes=rest_time_minutes)
                        
                        # 应用复杂公式计算new_started_at_UTC
                        new_utc_time = self.apply_complex_formula(base_time)
                        if new_utc_time:
                            # 使用first_finished_time的日期，保留计算的时间
                            new_utc_time = datetime.combine(target_date, new_utc_time.time())
                            row[new_started_at_utc_index] = self.format_datetime(new_utc_time)
                            self.processed_stats['new_started_at_utc_updated'] += 1
                            
                            # 计算new_started_at = new_started_at_UTC - 9小时
                            new_started_at_time = new_utc_time - timedelta(hours=9)
                            row[new_started_at_index] = self.format_datetime(new_started_at_time)
                            self.processed_stats['new_started_at_added'] += 1
                            
                            # 计算next_started_at
                            if video_length_minutes > 0:
                                next_time = new_utc_time + timedelta(minutes=video_length_minutes)
                                row[next_started_at_index] = self.format_datetime(next_time)
                                prev_next_time = next_time
                                self.processed_stats['next_started_at_updated'] += 1
            
            # 第三阶段：检查并调整日期范围（确保在8.1-9.30之间）
            self.log("第三阶段：检查并调整日期范围...")
            max_date = datetime(2025, 9, 30).date()
            
            for user_id in sorted(user_groups.keys()):
                user_data = user_groups[user_id]
                if not user_data:
                    continue
                
                # 找到该用户最后一个课程的日期
                last_row = user_data[-1][1]
                last_utc_str = last_row[new_started_at_utc_index]
                last_utc_dt = self.parse_datetime(last_utc_str)
                
                if last_utc_dt and last_utc_dt.date() > max_date:
                    # 计算需要提前的天数
                    days_over = (last_utc_dt.date() - max_date).days
                    self.log(f"用户 {user_id} 超出日期范围 {days_over} 天，调整所有日期...")
                    
                    # 调整该用户所有课程的日期
                    for row_index, row, course_id in user_data:
                        # 调整 new_started_at_UTC
                        utc_str = row[new_started_at_utc_index]
                        if utc_str:
                            utc_dt = self.parse_datetime(utc_str)
                            if utc_dt:
                                new_utc_dt = utc_dt - timedelta(days=days_over)
                                row[new_started_at_utc_index] = self.format_datetime(new_utc_dt)
                        
                        # 调整 next_started_at
                        next_str = row[next_started_at_index]
                        if next_str:
                            next_dt = self.parse_datetime(next_str)
                            if next_dt:
                                new_next_dt = next_dt - timedelta(days=days_over)
                                row[next_started_at_index] = self.format_datetime(new_next_dt)
                        
                        # 调整 new_started_at
                        started_str = row[new_started_at_index]
                        if started_str:
                            started_dt = self.parse_datetime(started_str)
                            if started_dt:
                                new_started_dt = started_dt - timedelta(days=days_over)
                                row[new_started_at_index] = self.format_datetime(new_started_dt)
            
            # 将处理后的行添加到结果中
            for row in all_rows:
                rows.append(row)
        
        # 写入输出文件
        with open(output_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(rows)
        
        self.log(f"处理完成！输出文件: {output_file}")
        self.print_statistics()
        return True
    
    def print_statistics(self):
        """打印处理统计信息"""
        self.log("=" * 50)
        self.log("处理统计信息:")
        self.log(f"总行数: {self.processed_stats['total_rows']}")
        self.log(f"Flag列更新: {self.processed_stats['flag_updated']}")
        self.log(f"New_course_id添加: {self.processed_stats['new_course_id_added']}")
        self.log(f"Course_video_length添加: {self.processed_stats['video_length_added']}")
        self.log(f"Rest_time添加: {self.processed_stats['rest_time_added']}")
        self.log(f"UTC时间设置: {self.processed_stats['utc_time_set']}")
        self.log(f"Next_started_at更新: {self.processed_stats['next_started_at_updated']}")
        self.log(f"New_started_at_UTC更新: {self.processed_stats['new_started_at_utc_updated']}")
        self.log(f"New_started_at添加: {self.processed_stats['new_started_at_added']}")
        self.log("=" * 50)

def main():
    """主函数"""
    processor = CSVProcessor()
    
    # 检查输入文件
    if not os.path.exists(INPUT_FILE):
        processor.log(f"错误：输入文件 {INPUT_FILE} 不存在")
        processor.log("请确保CSV文件存在于当前目录")
        return
    
    # 处理CSV文件
    success = processor.process_csv(INPUT_FILE, OUTPUT_FILE)
    
    if success:
        processor.log("✅ 所有处理完成！")
    else:
        processor.log("❌ 处理过程中出现错误")

if __name__ == "__main__":
    main()
