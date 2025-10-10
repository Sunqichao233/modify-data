import pandas as pd
import os
from collections import defaultdict

# 文件名数组 - 直接在代码中定义
FILE_LIST = [
    "IT School (21).csv",
    "IT School (30).csv",
    "IT School (31).csv",
    "IT School (32).csv",
    "IT School (33).csv",
    "IT School (34).csv",
    "IT School (35).csv",
    "IT School (36).csv",
    "IT School (47).csv",
    "IT School (53).csv",
    "IT School (72).csv",
    "IT School (82).csv",
    "IT School (85).csv",
    "IT School (90).csv",
    "IT School (91).csv",
    "IT School (93).csv"
]

def extract_username_course(csv_file_path):
    """
    CSVファイルからユーザー名とコース名の組み合わせを抽出する関数
    
    Args:
        csv_file_path (str): CSVファイルのパス
    
    Returns:
        dict: ユーザー名とコース名の情報
    """
    try:
        # CSVファイルを読み込み
        df = pd.read_csv(csv_file_path, encoding='utf-8')
        
        # ユーザー名とコース名の組み合わせを抽出し、重複を除去
        user_course_data = df[['ユーザー名', 'コース名']].dropna().drop_duplicates()
        
        return {
            'file_name': os.path.basename(csv_file_path),
            'user_course_pairs': user_course_data.to_dict('records')
        }
        
    except Exception as e:
        print(f"ファイル {csv_file_path} の処理中にエラーが発生しました: {e}")
        return None

def process_files_from_array():
    """
    配列に定義されたファイルリストを処理する関数
    
    Returns:
        list: 処理結果のリスト
    """
    print(f"処理対象ファイル数: {len(FILE_LIST)}")
    print("=" * 50)
    
    all_results = []
    all_pairs = []
    
    for i, file_name in enumerate(FILE_LIST, 1):
        file_path = f"csv/{file_name}"
        print(f"[{i}/{len(FILE_LIST)}] 処理中: {file_name}")
        
        if not os.path.exists(file_path):
            print(f"  ⚠️  ファイルが見つかりません: {file_path}")
            continue
        
        result = extract_username_course(file_path)
        
        if result:
            all_results.append(result)
            
            # ファイル名を追加して全体リストに追加
            for pair in result['user_course_pairs']:
                pair_with_file = {
                    'ユーザー名': pair['ユーザー名'],
                    'コース名': pair['コース名'],
                    'ファイル名': result['file_name']
                }
                all_pairs.append(pair_with_file)
            
            print(f"  ✅ 成功 - {len(result['user_course_pairs'])} 組のユーザー名・コース組み合わせを抽出")
        else:
            print(f"  ❌ 失敗")
    
    return all_results, all_pairs

def print_console_results(all_pairs):
    """
    結果をコンソールに表示（ファイル保存なし）
    
    Args:
        all_pairs (list): ユーザー名とコース名のペアリスト
    """
    print("\n" + "=" * 60)
    print("📋 抽出結果: ユーザー名とコース名の対応関係")
    print("=" * 60)
    
    # ユニークなユーザー名とコースを取得
    unique_usernames = list(set([pair['ユーザー名'] for pair in all_pairs]))
    unique_courses = list(set([pair['コース名'] for pair in all_pairs]))
    
    print(f"\n📊 統計情報:")
    print(f"  - 総組み合わせ数: {len(all_pairs)}")
    print(f"  - ユニークなユーザー名数: {len(unique_usernames)}")
    print(f"  - ユニークなコース数: {len(unique_courses)}")
    
    print(f"\n👥 抽出されたユーザー名一覧 ({len(unique_usernames)}人):")
    for i, username in enumerate(sorted(unique_usernames), 1):
        print(f"  {i:3d}. {username}")
    
    print(f"\n📚 抽出されたコース一覧 ({len(unique_courses)}コース):")
    for i, course in enumerate(sorted(unique_courses), 1):
        print(f"  {i:3d}. {course}")
    
    print(f"\n🔗 ユーザー名とコースの対応関係 ({len(all_pairs)}組):")
    for i, pair in enumerate(all_pairs, 1):
        print(f"  {i:3d}. {pair['ユーザー名']} → {pair['コース名']} (出典: {pair['ファイル名']})")
    
    # ユーザー別のコース一覧も表示
    user_courses = defaultdict(set)
    for pair in all_pairs:
        user_courses[pair['ユーザー名']].add(pair['コース名'])
    
    print(f"\n📋 ユーザー別コース一覧:")
    for i, (username, courses) in enumerate(sorted(user_courses.items()), 1):
        courses_list = sorted(list(courses))
        print(f"  {i:3d}. {username} ({len(courses_list)}コース):")
        for j, course in enumerate(courses_list, 1):
            print(f"       {j}. {course}")
    
    print("\n" + "=" * 60)
    print("📄 結果表示完了（ファイル保存なし）")
    print("=" * 60)

def main():
    """
    メイン関数
    """
    print("📁 CSVユーザー名・コース対応抽出スクリプト（配列版）")
    print("=" * 50)
    
    print(f"\n📋 処理対象ファイル一覧 ({len(FILE_LIST)}個):")
    for i, file_name in enumerate(FILE_LIST, 1):
        print(f"  {i:2d}. {file_name}")
    
    print("\n🚀 処理を開始します...")
    
    # ファイル処理実行
    all_results, all_pairs = process_files_from_array()
    
    if all_pairs:
        # 結果をコンソールに表示（ファイル保存なし）
        print_console_results(all_pairs)
        print("\n✅ 処理が完了しました！")
    else:
        print("\n❌ 処理できるデータがありませんでした。")

if __name__ == "__main__":
    main()