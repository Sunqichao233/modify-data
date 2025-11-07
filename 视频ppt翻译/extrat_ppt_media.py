import zipfile
import os

def extract_videos_from_pptx(pptx_path):
    import os, zipfile

    # 以脚本目录为基准定位 PPTX
    base_dir = os.path.dirname(os.path.abspath(__file__))
    full_path = pptx_path if os.path.isabs(pptx_path) else os.path.join(base_dir, pptx_path)

    # 输出目录：仓库根目录下的 extracted_videos
    repo_root = os.path.dirname(base_dir)  # c:\Users\user\Desktop\modify-data
    output_dir = os.path.join(repo_root, "extracted_videos")
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.exists(full_path):
        print(f"❌ 找不到文件：{full_path}")
        return

    with zipfile.ZipFile(full_path, 'r') as zip_ref:
        for file in zip_ref.namelist():
            if file.startswith("ppt/media/"):
                zip_ref.extract(file, output_dir)
        print(f"✅ 提取完成，文件保存在：{output_dir}")
    print("所有视频已提取完毕！")

extract_videos_from_pptx("2.Web3イントロダクション（2）.pptx")
