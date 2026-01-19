#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pillow 图片压缩脚本：支持批量目录处理、尺寸限制、质量设置和可选自适应压缩到最大字节。

功能概览：
- 处理单文件或目录（可递归）。
- 可指定输出格式：jpeg/png/webp，默认沿用原格式。
- 可限制最大宽高，按比例缩放（不放大）。
- 质量设置（JPEG/WebP）。
- 可移除EXIF元数据。
- 可选 JPEG 渐进式、优化等参数。
- 自适应到指定最大体积（max-bytes），自动二分降低质量至目标体积以内。
- RGBA 转 JPEG 时可指定背景色（用于去 alpha）。
- 跳过压缩后比原文件更大的结果。

安装依赖：
  pip install pillow
"""

import argparse
import csv
import os
import sys
import io
from pathlib import Path

try:
    from PIL import Image
except Exception:
    Image = None


def require_pillow():
    if Image is None:
        print("缺少 Pillow，请先安装：pip install pillow", file=sys.stderr)
        sys.exit(1)


def parse_color(hexstr: str):
    hexstr = hexstr.strip().lstrip('#')
    if len(hexstr) != 6:
        return (255, 255, 255)
    r = int(hexstr[0:2], 16)
    g = int(hexstr[2:4], 16)
    b = int(hexstr[4:6], 16)
    return (r, g, b)


def bound_size(w: int, h: int, max_w: int | None, max_h: int | None):
    scale = 1.0
    if max_w and w > max_w:
        scale = min(scale, max_w / float(w))
    if max_h and h > max_h:
        scale = min(scale, max_h / float(h))
    if scale < 1.0:
        return int(w * scale), int(h * scale)
    return w, h


def encode_to_bytes(img: Image.Image, fmt: str, *, quality: int, optimize: bool,
                    progressive: bool, strip_exif: bool) -> bytes:
    buf = io.BytesIO()
    save_kwargs = {}
    fmt_upper = fmt.upper()
    if fmt_upper == 'JPEG':
        save_kwargs.update(dict(quality=quality, optimize=optimize, progressive=progressive))
        # 不传 exif 即可去除元数据
    elif fmt_upper == 'WEBP':
        save_kwargs.update(dict(quality=quality, method=6))
    elif fmt_upper == 'PNG':
        save_kwargs.update(dict(optimize=optimize))
    # strip_exif: Pillow默认不传exif则不会保留，PNG的文本信息会被移除。
    img.save(buf, format=fmt_upper, **save_kwargs)
    return buf.getvalue()


def adaptive_compress(img: Image.Image, fmt: str, *, target_bytes: int,
                      quality: int, optimize: bool, progressive: bool,
                      strip_exif: bool) -> bytes:
    # 二分质量直到不超过 target_bytes 或质量降至20
    low, high = 20, max(quality, 20)
    best = None
    while low <= high:
        mid = (low + high) // 2
        data = encode_to_bytes(img, fmt, quality=mid, optimize=optimize,
                               progressive=progressive, strip_exif=strip_exif)
        size = len(data)
        best = data if (best is None or size < len(best)) else best
        if size > target_bytes:
            high = mid - 1
        else:
            low = mid + 1
    return best


def process_one(src: Path, dst: Path, *, out_fmt: str | None, quality: int,
                max_w: int | None, max_h: int | None, strip_exif: bool,
                optimize: bool, progressive: bool, max_bytes: int | None,
                alpha_bg: tuple[int, int, int], skip_if_larger: bool,
                retry_if_larger: bool = False, retry_quality: int = 75,
                retry_ratio: float = 0.98) -> dict:
    require_pillow()
    with Image.open(src) as im:
        in_fmt = (im.format or '').upper()
        fmt = (out_fmt or in_fmt or 'JPEG').upper()

        # 尺寸约束
        w, h = im.size
        new_w, new_h = bound_size(w, h, max_w, max_h)
        if (new_w, new_h) != (w, h):
            im = im.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # JPEG 需要无 alpha 且 RGB
        if fmt == 'JPEG':
            if im.mode in ('RGBA', 'LA') or ('A' in im.getbands()):
                bg = Image.new('RGBA', im.size, (*alpha_bg, 255))
                comp = Image.alpha_composite(bg, im.convert('RGBA'))
                im = comp.convert('RGB')
            elif im.mode not in ('RGB', 'L'):
                im = im.convert('RGB')

        # 编码
        if max_bytes:
            data = adaptive_compress(im, fmt, target_bytes=max_bytes, quality=quality,
                                     optimize=optimize, progressive=progressive,
                                     strip_exif=strip_exif)
        else:
            data = encode_to_bytes(im, fmt, quality=quality, optimize=optimize,
                                   progressive=progressive, strip_exif=strip_exif)

    original_size = src.stat().st_size
    out_size = len(data)
    if out_size >= original_size and skip_if_larger:
        # 如开启重试：针对 JPEG/WebP 通过自适应压缩到小于原体积
        in_retry_fmt = (out_fmt or (''))
        if retry_if_larger and ((in_retry_fmt or '').upper() in ('JPEG', 'WEBP') or (in_retry_fmt == '' and True)):
            # 优先使用实际输出格式 fmt
            target_bytes = max(int(original_size * retry_ratio), 1)
            data_retry = adaptive_compress(im, fmt, target_bytes=target_bytes,
                                           quality=retry_quality, optimize=optimize,
                                           progressive=progressive, strip_exif=strip_exif)
            out_size_retry = len(data_retry)
            if out_size_retry < original_size:
                data = data_retry
                out_size = out_size_retry
            else:
                return {
                    'src': str(src), 'dst': str(dst), 'written': False,
                    'reason': 'retry_still_larger', 'original_bytes': original_size,
                    'output_bytes': out_size_retry
                }
        else:
            return {
                'src': str(src), 'dst': str(dst), 'written': False,
                'reason': 'compressed>=original', 'original_bytes': original_size,
                'output_bytes': out_size
            }

    dst.parent.mkdir(parents=True, exist_ok=True)
    with open(dst, 'wb') as f:
        f.write(data)
    return {
        'src': str(src), 'dst': str(dst), 'written': True,
        'original_bytes': original_size, 'output_bytes': out_size
    }


def iter_inputs(root: Path, recursive: bool, exts: set[str]):
    if root.is_file():
        yield root
        return
    if recursive:
        for p in root.rglob('*'):
            if p.is_file() and p.suffix.lower().lstrip('.') in exts:
                yield p
    else:
        for p in root.glob('*'):
            if p.is_file() and p.suffix.lower().lstrip('.') in exts:
                yield p


def main():
    parser = argparse.ArgumentParser(description='Pillow 图片压缩脚本')
    parser.add_argument('--input', required=True, help='输入文件或目录')
    parser.add_argument('--output', required=True, help='输出目录')
    parser.add_argument('--recursive', action='store_true', help='递归处理子目录')
    parser.add_argument('--format', choices=['jpeg', 'png', 'webp'], default=None, help='输出格式，默认跟随原图')
    parser.add_argument('--quality', type=int, default=85, help='质量 (JPEG/WebP)')
    parser.add_argument('--max-width', type=int, default=None, help='最大宽度')
    parser.add_argument('--max-height', type=int, default=None, help='最大高度')
    parser.add_argument('--strip-exif', action='store_true', help='移除EXIF元数据')
    parser.add_argument('--optimize', dest='optimize', action='store_true', default=True, help='启用优化')
    parser.add_argument('--no-optimize', dest='optimize', action='store_false', help='禁用优化')
    parser.add_argument('--progressive', action='store_true', help='JPEG 渐进式')
    parser.add_argument('--suffix', default='', help='输出文件名后缀')
    parser.add_argument('--overwrite', action='store_true', help='若存在则覆盖输出文件')
    parser.add_argument('--max-bytes', type=int, default=None, help='目标最大体积（字节），按质量二分逼近')
    parser.add_argument('--alpha-bg', default='#FFFFFF', help='RGBA 转 JPEG 背景色，形如 #RRGGBB')
    parser.add_argument('--exts', default='jpg,jpeg,png,webp', help='处理的扩展名列表，逗号分隔')
    parser.add_argument('--skip-if-larger', action='store_true', default=True, help='压缩后更大则跳过写入')
    parser.add_argument('--dry-run', action='store_true', help='仅显示计划，不实际写入')
    parser.add_argument('--retry-if-larger', action='store_true', help='若压缩后更大，则尝试自适应降低质量以小于原文件体积')
    parser.add_argument('--retry-quality', type=int, default=75, help='重试时起始质量（JPEG/WebP）')
    parser.add_argument('--retry-ratio', type=float, default=0.98, help='重试目标比例（例如0.98表示结果≤原体积的98%）')
    parser.add_argument('--report', default=None, help='输出报告CSV路径（记录前后体积对比与是否写入）')
    parser.add_argument('--report-encoding', default='utf-8-sig', help='报告文件编码（默认utf-8-sig，便于Excel）')

    args = parser.parse_args()
    in_path = Path(args.input)
    out_root = Path(args.output)
    out_fmt = (args.format.lower() if args.format else None)
    exts = set(x.strip().lower() for x in args.exts.split(',') if x.strip())
    alpha_bg = parse_color(args.alpha_bg)

    if args.dry_run:
        print(f"计划：处理 {in_path} → 输出到 {out_root}，格式={out_fmt or '跟随原图'}，质量={args.quality}，max({args.max_width}x{args.max_height})，recursive={args.recursive}, strip_exif={args.strip_exif}, progressive={args.progressive}, optimize={args.optimize}, max_bytes={args.max_bytes}")

    count_total = 0
    count_written = 0
    report_rows = []
    for src in iter_inputs(in_path, args.recursive, exts):
        rel = src.name if in_path.is_file() else src.relative_to(in_path)
        suffix = args.suffix or ''
        dst_name = src.stem + (suffix if suffix else '') + '.' + (out_fmt or src.suffix.lstrip('.'))
        dst = out_root / rel.parent / dst_name
        if dst.exists() and not args.overwrite:
            # 记录报告：以KB单位输出
            orig_bytes = src.stat().st_size
            out_bytes = dst.stat().st_size if dst.exists() else None
            orig_kb = round(orig_bytes / 1024.0, 2)
            out_kb = (round(out_bytes / 1024.0, 2) if out_bytes is not None else None)
            delta_kb = (round((out_bytes - orig_bytes) / 1024.0, 2) if (out_bytes is not None) else None)
            delta_pct = (round((out_bytes - orig_bytes) / orig_bytes * 100.0, 2) if (out_bytes is not None and orig_bytes > 0) else None)
            report_rows.append({
                'src': str(src), 'dst': str(dst), 'written': False,
                'reason': 'exists', 'original_kb': orig_kb,
                'output_kb': out_kb, 'delta_kb': delta_kb,
                'delta_percent': delta_pct
            })
            print(f"跳过（存在）：{dst}")
            continue
        count_total += 1
        if args.dry_run:
            print(f"拟压缩：{src} → {dst}")
            continue
        stat = process_one(src, dst, out_fmt=out_fmt, quality=args.quality,
                           max_w=args.max_width, max_h=args.max_height,
                           strip_exif=args.strip_exif, optimize=args.optimize,
                           progressive=args.progressive, max_bytes=args.max_bytes,
                           alpha_bg=alpha_bg, skip_if_larger=args.skip_if_larger,
                           retry_if_larger=args.retry_if_larger,
                           retry_quality=args.retry_quality,
                           retry_ratio=args.retry_ratio)
        if stat['written']:
            count_written += 1
            print(f"✔ {src} → {dst} ({stat['original_bytes']}B → {stat['output_bytes']}B)")
            delta_bytes = stat['output_bytes'] - stat['original_bytes']
            report_rows.append({
                'src': stat['src'], 'dst': stat['dst'], 'written': True,
                'reason': '',
                'original_kb': round(stat['original_bytes'] / 1024.0, 2),
                'output_kb': round(stat['output_bytes'] / 1024.0, 2),
                'delta_kb': round(delta_bytes / 1024.0, 2),
                'delta_percent': (round(delta_bytes / stat['original_bytes'] * 100.0, 2) if stat['original_bytes'] > 0 else None)
            })
        else:
            reason = stat.get('reason', 'compressed>=original')
            if reason == 'retry_still_larger':
                print(f"↷ 重试后仍更大，跳过：{src} ({stat['original_bytes']}B → {stat['output_bytes']}B)")
            else:
                print(f"↷ 跳过写入（压缩更大）：{src} ({stat['original_bytes']}B → {stat['output_bytes']}B)")
            delta_bytes = stat['output_bytes'] - stat['original_bytes']
            report_rows.append({
                'src': stat['src'], 'dst': stat['dst'], 'written': False,
                'reason': reason,
                'original_kb': round(stat['original_bytes'] / 1024.0, 2),
                'output_kb': round(stat['output_bytes'] / 1024.0, 2),
                'delta_kb': round(delta_bytes / 1024.0, 2),
                'delta_percent': (round(delta_bytes / stat['original_bytes'] * 100.0, 2) if stat['original_bytes'] > 0 else None)
            })

    print(f"完成：计划处理 {count_total} 个文件，成功写入 {count_written} 个文件。")

    # 写报告
    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with open(report_path, 'w', newline='', encoding=args.report_encoding) as f:
            writer = csv.DictWriter(f, fieldnames=[
                'src', 'dst', 'written', 'reason', 'original_kb', 'output_kb', 'delta_kb', 'delta_percent'
            ])
            writer.writeheader()
            for row in report_rows:
                writer.writerow(row)
        print(f"报告已写入：{report_path}")


if __name__ == '__main__':
    main()

