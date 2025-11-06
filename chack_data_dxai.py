import pandas as pd
from datetime import datetime, timedelta
import holidays
import os
import glob
import math

# ========= 可配置：CSV 文件夹路径 =========
folder_path = r"C:\Users\softusing\Desktop\trip7.ai改数据相关\check\csv"
# ======================================

# ---- 通用：时间解析（自动兼容 yyyy/m/d h:mm、是否带秒、斜杠/横杠） ----
def parse_dt(s):
    """返回 python datetime 或 None"""
    if pd.isna(s):
        return None
    try:
        ts = pd.to_datetime(str(s).strip(), errors='coerce')
    except Exception:
        return None
    if pd.isna(ts):
        return None
    return ts.to_pydatetime()


def parse_d(s):
    """返回 date 或 None"""
    dt = parse_dt(s)
    return dt.date() if isinstance(dt, datetime) else None

# 標準視聴時間 "HH:MM:SS" 或 "MM:SS" -> 分钟（float）
def time_to_minutes(time_str):
    if pd.isna(time_str):
        return None
    parts = str(time_str).strip().split(':')
    try:
        if len(parts) == 3:
            h, m, s = map(int, parts)
        elif len(parts) == 2:
            h, (m, s) = 0, map(int, parts)  # 25:44 -> 0:25:44
        else:
            return None
        return h * 60 + m + s / 60.0
    except Exception:
        return None

# 工作时段校验：落在 [09:00,12:00) ∪ [13:00,18:00)
def is_valid_time_window(start_dt, end_dt):
    def in_window(t):
        return (9 <= t.hour < 12) or (13 <= t.hour < 18)
    return in_window(start_dt) and in_window(end_dt)

# 工作日（非周末、非日本节假日）——安全版
def is_weekday_jp(date_obj):
    # 屏蔽 None / NaN
    if date_obj is None:
        return False
    if isinstance(date_obj, float) and math.isnan(date_obj):
        return False
    # 允许传 datetime
    if isinstance(date_obj, datetime):
        date_obj = date_obj.date()
    # 不是 date 就返回 False
    if not hasattr(date_obj, "year"):
        return False
    try:
        y = int(date_obj.year)  # 若为 NaN 会抛异常
    except Exception:
        return False
    jp_holidays = holidays.Japan(years=y)
    return (date_obj.weekday() < 5) and (date_obj not in jp_holidays)

# 读取文件夹内所有 CSV
csv_files = glob.glob(os.path.join(folder_path, "*.csv"))

problematic_files = []

for file_path in csv_files:
    try:
        df = pd.read_csv(file_path, encoding='utf-8-sig')
    except UnicodeDecodeError:
        df = pd.read_csv(file_path)

    # 列名检查：依截图采用開始時間 / 完了時間 / 標準視聴時間
    required_cols = ['開始時間', '完了時間', '標準視聴時間']
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        print(f"文件 {os.path.basename(file_path)} 缺少必要列：{', '.join(missing)}，已跳过。")
        continue

    # 计算标准观看分钟
    df['標準視聴時間_分'] = df['標準視聴時間'].apply(time_to_minutes)

    # 生成可排序的起始时间列与原索引
    df['_start_dt'] = df['開始時間'].apply(parse_dt)
    df['_end_dt']   = df['完了時間'].apply(parse_dt)
    df['_date_only'] = df['_start_dt'].apply(lambda x: x.date() if isinstance(x, datetime) else None)
    df['_orig_idx'] = df.index

    # 排序：先按日期再按开始时间（稳定排序）
    work = df.sort_values(by=['_date_only', '_start_dt'], kind='mergesort').reset_index(drop=True)

    issues = set()

    for i, row in work.iterrows():
        orig_idx = int(row['_orig_idx'])
        start_dt = row['_start_dt']
        end_dt   = row['_end_dt']
        std_minutes = row['標準視聴時間_分']

        # 基础有效性：必须是有效 datetime
        if (not isinstance(start_dt, datetime)) or (not isinstance(end_dt, datetime)):
            issues.add((orig_idx, "条件 1 失败：时间格式无效（开始/结束）"))
            continue

        # 条件 0：结束早于开始 或 跨日/跨月（通常视为异常）
        if (end_dt < start_dt) or (end_dt.date() != start_dt.date()):
            issues.add((orig_idx, "条件 0 失败：结束时间早于开始或跨日/跨月"))

        # 標準視聴時間 转 timedelta
        if pd.isna(std_minutes):
            issues.add((orig_idx, "无效的标准观看时间：NaN 或无效格式"))
            duration = None
        else:
            try:
                duration = timedelta(minutes=float(std_minutes))
            except Exception:
                duration = None
                issues.add((orig_idx, "无效的标准观看时间：无法转为分钟"))

        # 条件 1：结束 >= 开始 + 标准观看时间
        if duration is not None:
            if end_dt < start_dt + duration:
                issues.add((orig_idx, "条件 1 失败：结束时间早于“开始+标准观看时间”"))

        # 条件 2：同一天时，下一条开始 > 上一条结束
        if i > 0:
            prev_row = work.iloc[i - 1]
            prev_end = prev_row['_end_dt']
            prev_start = prev_row['_start_dt']
            if isinstance(prev_start, datetime) and isinstance(prev_end, datetime):
                if start_dt.date() == prev_start.date() and start_dt < prev_end:
                    issues.add((orig_idx, "条件 2 失败：开始时间未晚于前一视频结束时间（同日）"))

        # 条件 3：工作时段 + 工作日
        if not is_valid_time_window(start_dt, end_dt):
            issues.add((orig_idx, "条件 3 失败：时间超出有效工作时段（含12:00-13:00排除）"))
        if not is_weekday_jp(start_dt.date()):
            issues.add((orig_idx, "条件 3 失败：周末或日本节假日"))

    # 有问题则记录文件名
    if issues:
        problematic_files.append(os.path.basename(file_path))

    # 写高亮并保存（CSV 不支持真正背景色，这里仅做标记列）
    df['Highlight'] = ''
    for idx, reason in issues:
        df.at[idx, 'Highlight'] = 'background-color: red'
        print(f"文件 {os.path.basename(file_path)} 的第 {idx + 1} 行存在问题：{reason}")

    # 清理工作列
    for col in ['_start_dt', '_end_dt', '_date_only', '_orig_idx']:
        if col in df.columns:
            df.drop(columns=[col], inplace=True)

    # 保存回源文件
    df.to_csv(file_path, index=False, encoding='utf-8-sig')

# 汇总输出
if problematic_files:
    print("\n以下文件存在问题：")
    for f in problematic_files:
        print(f"- {f}")
else:
    print("所有文件均无问题。")
