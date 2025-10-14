import pandas as pd
import os
import sys

def get_excel_user_data(file_path):
    """
    Excelファイルを読み取り、各シートのユーザーデータを取得
    
    Args:
        file_path (str): Excelファイルのパス
    
    Returns:
        list: ユーザーとコースの情報を含む辞書のリスト
    """
    try:
        # ファイルの存在確認
        if not os.path.exists(file_path):
            print(f"エラー：ファイル '{file_path}' が存在しません")
            return None
        
        # ファイル拡張子の確認
        if not file_path.lower().endswith(('.xlsx', '.xls')):
            print(f"エラー：'{file_path}' は有効なExcelファイルではありません")
            return None
        
        # Excelファイルを読み込み
        excel_file = pd.ExcelFile(file_path)
        sheet_names = excel_file.sheet_names
        
        tasks = []
        
        # 各シートを処理
        for sheet_name in sheet_names:
            try:
                # シートのデータを読み込み
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                
                # データが存在する場合
                if not df.empty:
                    # 各行がユーザーを表すと仮定
                    # 最初の列をユーザー名として使用（列名に関係なく）
                    user_column = df.columns[0] if len(df.columns) > 0 else None
                    
                    if user_column is not None:
                        # NaNでない値のみを取得
                        users = df[user_column].dropna().astype(str).tolist()
                        
                        # 各ユーザーに対してタスクを作成
                        for user in users:
                            if user.strip():  # 空文字列でない場合
                                tasks.append({
                                    "user": user.strip(),
                                    "course": sheet_name
                                })
                
            except Exception as e:
                print(f"シート '{sheet_name}' の読み込み中にエラーが発生しました: {str(e)}")
                continue
        
        return tasks
        
    except Exception as e:
        print(f"ファイル読み込み中にエラーが発生しました：{str(e)}")
        return None

def format_javascript_output(tasks):
    """
    タスクリストをJavaScript形式の文字列に変換
    
    Args:
        tasks (list): ユーザーとコースの情報を含む辞書のリスト
    
    Returns:
        str: JavaScript形式の文字列
    """
    if not tasks:
        return "const tasks = [];"
    
    js_output = "const tasks = [\n"
    
    for i, task in enumerate(tasks):
        comma = "," if i < len(tasks) - 1 else ""
        js_output += f'    {{ user: "{task["user"]}", course: "{task["course"]}" }}{comma}\n'
    
    js_output += "  ];"
    
    return js_output

def main():
    # Excelファイル名を指定
    file_path = "10.7社外数据check.xlsx"
    
    # ユーザーデータを取得
    tasks = get_excel_user_data(file_path)
    
    if tasks:
        print(f"\nファイル '{os.path.basename(file_path)}' から {len(tasks)} 件のユーザーデータを取得しました：\n")
        
        # JavaScript形式で出力
        js_output = format_javascript_output(tasks)
        print(js_output)
        
        # 統計情報を表示
        courses = set(task['course'] for task in tasks)
        print(f"\n統計情報:")
        print(f"- 総ユーザー数: {len(tasks)}")
        print(f"- コース数: {len(courses)}")
        print(f"- コース一覧: {', '.join(courses)}")
        
    else:
        print("ユーザーデータを取得できませんでした")

if __name__ == "__main__":
    main()