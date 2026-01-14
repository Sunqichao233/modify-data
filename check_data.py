import pandas as pd
from datetime import datetime, timedelta
import holidays
import os
import glob
import sys
import codecs
import re
from collections import defaultdict

# Windows控制台UTF-8编码支持
if sys.platform == 'win32':
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

# ========= 可配置：CSV 文件夹路径 =========
folder_path = r"C:\Users\user\Desktop\modify-data\csv\itschool"
# ======================================

# ========= 可配置：课程数据量要求 =========
# 格式：{"课程名": 要求的数据条数}
course_requirements = {
    "AIサーバー構築実戦コース": 32,
    "AIデータ分析中級コース": 41,
    "AIデータサイエンス中級コース": 41,
    "AIプログラミング中級コース": 43,
    "AIプログラミング基礎コース": 46,
    "AIサーバー構築基礎コース": 32,
    "AIサーバーのDX化活用実戦コース": 25,
    "大規模言語モデル": 32,
    "React中級コース": 32,
    "生成AI活用スキル習得（ChatGPT）": 44,
}
# ======================================

# ---- 通用：时间解析（兼容横杠/斜杠，带/不带秒） ----
def parse_dt(s):
    if pd.isna(s):
        return None
    s = str(s).strip()
    fmts = ('%Y-%m-%d %H:%M', '%Y/%m/%d %H:%M',
            '%Y-%m-%d %H:%M:%S', '%Y/%m/%d %H:%M:%S')
    for fmt in fmts:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None

def parse_d(s):
    if pd.isna(s):
        return None
    s = str(s).strip()
    for fmt in ('%Y-%m-%d', '%Y/%m/%d'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None

# 標準視聴時間 "HH:MM:SS" -> 分钟（float）
def time_to_minutes(time_str):
    if pd.isna(time_str):
        return None
    try:
        h, m, s = map(int, str(time_str).split(':'))
        return h * 60 + m + s / 60.0
    except Exception:
        return None

# 工作时段校验：落在 [09:00,12:00) ∪ [13:00,18:00)
def is_valid_time_window(start_dt, end_dt):
    def in_window(t):
        return (9 <= t.hour < 12) or (13 <= t.hour < 18)
    return in_window(start_dt) and in_window(end_dt)

# 工作日（非周末、非日本节假日）
def is_weekday_jp(date_obj):
    if date_obj is None:
        return False
    try:
        # 确保 year 是有效的整数
        year = int(date_obj.year)
        jp_holidays = holidays.Japan(years=year)
        return (date_obj.weekday() < 5) and (date_obj not in jp_holidays)
    except (ValueError, TypeError, AttributeError):
        # 处理 NaN 或其他无效值
        return False

# 从文件名或CSV内容中提取课程名
def extract_course_name(file_path, df):
    """
    尝试从文件名或CSV内容中提取课程名
    优先级：1. 文件名匹配 2. CSV中的课程列
    """
    filename = os.path.basename(file_path)
    
    # 方法1：从文件名中匹配课程名
    for course in course_requirements.keys():
        if course in filename:
            return course
    
    # 方法2：检查CSV中是否有课程相关的列
    course_columns = ['コース名', 'course', 'Course', '课程名', '課程名']
    for col in course_columns:
        if col in df.columns:
            # 取第一个非空值作为课程名
            course_values = df[col].dropna().unique()
            if len(course_values) > 0:
                course_name = str(course_values[0])
                # 检查是否匹配配置中的课程
                for req_course in course_requirements.keys():
                    if req_course in course_name or course_name in req_course:
                        return req_course
    
    return None

# 检查数据量是否足够
def check_data_count(file_path, df):
    """
    检查CSV文件的数据量是否满足课程要求
    返回：(是否满足, 课程名, 实际数量, 要求数量, 缺少数量)
    """
    course_name = extract_course_name(file_path, df)
    
    if course_name is None:
        return True, None, len(df), 0, 0  # 未匹配到课程，不检查
    
    required_count = course_requirements.get(course_name, 0)
    actual_count = len(df)
    
    if actual_count < required_count:
        missing_count = required_count - actual_count
        return False, course_name, actual_count, required_count, missing_count
    
    return True, course_name, actual_count, required_count, 0

# 提取模块中的章节号
def extract_chapter_number(module_str):
    """
    从模块名中提取章节号
    例如："第1章" -> 1, "第二章" -> 2
    """
    if pd.isna(module_str):
        return None
    
    module_str = str(module_str).strip()
    
    # 匹配数字章节：第1章、第2章等
    match = re.search(r'第(\d+)章', module_str)
    if match:
        return int(match.group(1))
    
    # 匹配汉字数字章节：第一章、第二章等
    chinese_numbers = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
    }
    
    for chinese, number in chinese_numbers.items():
        if f'第{chinese}章' in module_str:
            return number
    
    return None

# 提取课程的基础名称和序号
def extract_lesson_base_and_number(lesson_str):
    """
    从课程名中提取基础名称和序号
    例如："pandasのデータ変形（1）" -> ("pandasのデータ変形", 1)
         "Nullable型（２）" -> ("Nullable型", 2)
    返回：(基础名称, 序号) 或 (None, None)
    """
    if pd.isna(lesson_str):
        return None, None
    
    lesson_str = str(lesson_str).strip()
    
    # 匹配日文括号中的数字：（1）、（2）等
    match = re.search(r'(.+?)（(\d+)）', lesson_str)
    if match:
        base_name = match.group(1).strip()
        number = int(match.group(2))
        return base_name, number
    
    # 匹配英文括号中的数字：(1)、(2)等
    match = re.search(r'(.+?)\((\d+)\)', lesson_str)
    if match:
        base_name = match.group(1).strip()
        number = int(match.group(2))
        return base_name, number
    
    return None, None

# 检查模块顺序
def check_module_order(df):
    """
    检查模块中章节的顺序是否正确
    返回：问题列表 [(行号, 问题描述), ...]
    """
    issues = []
    
    if 'モジュール' not in df.columns:
        return issues
    
    # 提取章节号并记录原始行号
    chapter_data = []
    for idx, row in df.iterrows():
        chapter_num = extract_chapter_number(row['モジュール'])
        if chapter_num is not None:
            chapter_data.append((idx, chapter_num, row['モジュール']))
    
    if not chapter_data:
        return issues
    
    # 检查章节顺序
    prev_chapter = 0
    
    for idx, chapter_num, module_name in chapter_data:
        if chapter_num > prev_chapter + 1:
            # 跳章了
            issues.append((idx, f"モジュール順序エラー：第{prev_chapter}章の後に第{chapter_num}章が出現（{module_name}）"))
        elif chapter_num < prev_chapter:
            # 章节倒退了
            issues.append((idx, f"モジュール順序エラー：第{chapter_num}章が第{prev_chapter}章の後に出現（{module_name}）"))
        
        if chapter_num > prev_chapter:
            prev_chapter = chapter_num
    
    return issues

# 检查课程顺序（修正版）
def check_lesson_order(df):
    """
    检查同一系列课程中序号的顺序是否正确
    只检查同一基础名称的课程序号顺序
    返回：问题列表 [(行号, 问题描述), ...]
    """
    issues = []
    
    if 'レッスン' not in df.columns:
        return issues
    
    # 按模块分组检查课程顺序
    if 'モジュール' in df.columns:
        for module_name, group in df.groupby('モジュール'):
            # 收集同一模块内的课程信息
            lesson_series = defaultdict(list)  # {基础名称: [(行号, 序号, 完整名称), ...]}
            
            for idx, row in group.iterrows():
                base_name, lesson_num = extract_lesson_base_and_number(row['レッスン'])
                if base_name is not None and lesson_num is not None:
                    lesson_series[base_name].append((idx, lesson_num, row['レッスン']))
            
            # 检查每个系列的顺序
            for base_name, lessons in lesson_series.items():
                if len(lessons) <= 1:
                    continue
                
                # 按原始行号排序（保持在CSV中的出现顺序）
                lessons.sort(key=lambda x: x[0])
                
                # 检查序号是否递增
                for i in range(1, len(lessons)):
                    prev_idx, prev_num, prev_name = lessons[i-1]
                    curr_idx, curr_num, curr_name = lessons[i]
                    
                    if curr_num <= prev_num:
                        issues.append((curr_idx, f"レッスン順序エラー：{base_name}シリーズで（{curr_num}）が（{prev_num}）の後に出現（{curr_name}）"))
                    elif curr_num > prev_num + 1:
                        # 可选：检查是否跳号（如果需要严格连续的话）
                        # issues.append((curr_idx, f"レッスン順序警告：{base_name}シリーズで（{prev_num}）の後に（{curr_num}）が出現、連続していない（{curr_name}）"))
                        pass
    else:
        # 没有模块列，直接检查整个文件的课程顺序
        lesson_series = defaultdict(list)
        
        for idx, row in df.iterrows():
            base_name, lesson_num = extract_lesson_base_and_number(row['レッスン'])
            if base_name is not None and lesson_num is not None:
                lesson_series[base_name].append((idx, lesson_num, row['レッスン']))
        
        # 检查每个系列的顺序
        for base_name, lessons in lesson_series.items():
            if len(lessons) <= 1:
                continue
            
            lessons.sort(key=lambda x: x[0])
            
            for i in range(1, len(lessons)):
                prev_idx, prev_num, prev_name = lessons[i-1]
                curr_idx, curr_num, curr_name = lessons[i]
                
                if curr_num <= prev_num:
                    issues.append((curr_idx, f"レッスン順序エラー：{base_name}シリーズで（{curr_num}）が（{prev_num}）の後に出現（{curr_name}）"))
    
    return issues

# 读取文件夹内所有 CSV
csv_files = glob.glob(os.path.join(folder_path, "*.csv"))

problematic_files = []
insufficient_data_files = []  # 数据量不足的文件
order_issue_files = []  # 顺序问题的文件

for file_path in csv_files:
    try:
        df = pd.read_csv(file_path, encoding='utf-8-sig')
    except UnicodeDecodeError:
        # 兜底尝试默认编码
        df = pd.read_csv(file_path)

    # 检查数据量
    is_sufficient, course_name, actual_count, required_count, missing_count = check_data_count(file_path, df)
    if not is_sufficient:
        insufficient_data_files.append({
            'file': os.path.basename(file_path),
            'course': course_name,
            'actual': actual_count,
            'required': required_count,
            'missing': missing_count
        })
        print(f"データ量不足：ファイル {os.path.basename(file_path)} (コース: {course_name}) 実際データ {actual_count} 件、要求 {required_count} 件、不足 {missing_count} 件")

    # 检查顺序
    module_issues = check_module_order(df)
    lesson_issues = check_lesson_order(df)
    
    order_issues = module_issues + lesson_issues
    if order_issues:
        order_issue_files.append(os.path.basename(file_path))
        print(f"\n=== ファイル {os.path.basename(file_path)} の順序チェック結果 ===")
        for idx, issue_desc in order_issues:
            print(f"順序問題：第 {idx + 1} 行 - {issue_desc}")
    else:
        print(f"\n=== ファイル {os.path.basename(file_path)} の順序チェック結果 ===")
        print("順序問題なし")

    # 缺失必须列时跳过时间相关检查
    required_cols = ['視聴開始時間', '視聴完了時間', '標準視聴時間']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        print(f"ファイル {os.path.basename(file_path)} 必要列不足：{', '.join(missing_cols)}、データ品質チェックをスキップ。")
        continue

    # 计算标准观看分钟
    df['標準視聴時間_分'] = df['標準視聴時間'].apply(time_to_minutes)

    # 生成可排序的起始时间列与原索引
    df['_start_dt'] = df['視聴開始時間'].apply(parse_dt)
    df['_end_dt'] = df['視聴完了時間'].apply(parse_dt)
    df['_date_only'] = df['_start_dt'].apply(lambda x: x.date() if pd.notna(x) else None)
    df['_orig_idx'] = df.index

    # 为了"条件2 同一天上一条结束 < 下一条开始"正确，按开始时间排序
    work = df.sort_values(by=['_date_only', '_start_dt'], kind='mergesort').reset_index(drop=True)

    issues = set()

    for i, row in work.iterrows():
        orig_idx = int(row['_orig_idx'])
        start_dt = row['_start_dt']
        end_dt = row['_end_dt']
        std_minutes = row['標準視聴時間_分']

        # 基础有效性
        if start_dt is None or end_dt is None:
            issues.add((orig_idx, "条件 1 失败：时间格式无效（开始/结束）"))
            continue

        # 条件 0：结束早于开始 或 跨日/跨月（通常视为异常）
        if (end_dt < start_dt) or (end_dt.date() != start_dt.date()):
            issues.add((orig_idx, "条件 0 失败：结束时间早于开始或跨日/跨月"))
            # 继续做其他检查以便给出更多信号（不直接 continue）

        # 標準視聴時間 转 timedelta
        if pd.isna(std_minutes):
            issues.add((orig_idx, "无效的标准观看时间：NaN 或无效格式"))
            # 没有标准时长也继续其他检查
            duration = None
        else:
            try:
                duration = timedelta(minutes=float(std_minutes))
            except Exception:
                duration = None
                issues.add((orig_idx, "无效的标准观看时间：无法转为分钟"))

        # 条件 1：结束 >= 开始 + 标准观看时间（用 datetime 比较，保留日期）
        if duration is not None:
            if end_dt < start_dt + duration:
                issues.add((orig_idx, "条件 1 失败：结束时间早于“开始+标准观看时间”"))

        # 条件 2：同一天时，下一条开始 > 上一条结束
        if i > 0:
            prev_row = work.iloc[i - 1]
            prev_end = prev_row['_end_dt']
            prev_start = prev_row['_start_dt']
            if (prev_start is not None and prev_end is not None and
                start_dt.date() == prev_start.date()):
                if start_dt < prev_end:
                    issues.add((orig_idx, "条件 2 失败：开始时间未晚于前一视频结束时间（同日）"))

        # 条件 3：工作时段 + 工作日
        if start_dt is not None and end_dt is not None:
            if not is_valid_time_window(start_dt, end_dt):
                issues.add((orig_idx, "条件 3 失败：时间超出有效工作时段（含12:00-13:00排除）"))
            if not is_weekday_jp(start_dt.date()):
                issues.add((orig_idx, "条件 3 失败：周末或日本节假日"))

    # 有问题则记录文件名
    if issues:
        problematic_files.append(os.path.basename(file_path))

    # 写高亮并保存
    df['Highlight'] = ''
    for idx, reason in issues:
        # 允许多条原因覆盖；这里仅写一个标记，控制台打印详细原因
        df.at[idx, 'Highlight'] = 'background-color: red'
        print(f"ファイル {os.path.basename(file_path)} の第 {idx + 1} 行に問題：{reason}")

    # 清理工作列
    for col in ['_start_dt', '_end_dt', '_date_only', '_orig_idx']:
        if col in df.columns:
            df.drop(columns=[col], inplace=True)

    # 保存回源文件
    df.to_csv(file_path, index=False, encoding='utf-8-sig')

# 汇总输出
print("\n=== データ品質チェック結果 ===")
if problematic_files:
    print("\n以下のファイルにデータ品質問題があります：")
    for f in problematic_files:
        print(f"- {f}")
else:
    print("すべてのファイルのデータ品質は正常です。")

print("\n=== データ量チェック結果 ===")
if insufficient_data_files:
    print("\n以下のファイルのデータ量が不足しています：")
    for file_info in insufficient_data_files:
        print(f"- {file_info['file']} (コース: {file_info['course']}) - 実際: {file_info['actual']} 件、要求: {file_info['required']} 件、不足: {file_info['missing']} 件")
else:
    print("すべてのファイルのデータ量は要求を満たしています。")

print("\n=== 順序チェック結果 ===")
if order_issue_files:
    print("\n以下のファイルに順序問題があります：")
    for f in order_issue_files:
        print(f"- {f}")
else:
    print("すべてのファイルの順序は正常です。")

print("\n=== コースデータ量要求設定 ===")
for course, count in course_requirements.items():
    print(f"- {course}: {count} 件")
