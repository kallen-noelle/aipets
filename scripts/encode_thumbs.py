"""Transcode step02 transparent videos into 640x360 playback thumbs (step04).

素材处理链的第 3 步（转码）：把 step02/ 的透明视频（PR 手工抠像或自动抠像产物）
转成 640x360 播放变体（step04/），供 dsh-pet 插件运行时使用。

完整处理链：
  pr/*.mov（PR 手工抠像）→ pr_import_step02.py → step02/（透明 webm，1280x720）
  → 本脚本 → step04/（640x360 播放变体）

  注：normalize_step03.py（归一化 2160x1215 统一站立居中）已不在主流程中使用，
  本脚本直接读 step02/、不再依赖 step03/；需要统一各动作的站立高度与脚底位置时
  仍可手工跑一次，但其产物不会被主流程读取。

step04 是素材处理链的最终产物。发布/安装插件时把 step04 的内容
同步到 dsh-pet/assets/webm/（npm 包需要自包含的播放资源）。

为什么需要转码：
- 播放时宠物只显示约 260px，360 高度已足够清晰，1280 是 3.5 倍冗余
- 原始尺寸全量体积远超 npm 包体积上限；转码后约 10MB，可以发布
- 播放更省内存、切换更快

双轨设计：
- thumb（本脚本产物，640x360，step04）→ 同步进 npm 包 assets/webm/，运行时播放
- full（step02 原始透明视频）→ 不进 npm 包，发布到 GitHub Releases 存档

音频：上一步（pr_import_step02.py / chroma_step02.py）产出的 step02 若带音轨，
本脚本会一并转码进 step04，编码为 Opus（WebM 容器标准音频编码）。音轨缺失时
（例如无声素材）自动跳过，不会报错。
"""

from __future__ import annotations

import shutil
import subprocess
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "step02"
OUT = ROOT / "step04"


def _tool(name: str) -> str:
    """解析 ffmpeg / ffprobe：优先 PATH，找不到时退回原工程自带的 .tools。"""
    found = shutil.which(name)
    if found:
        return found
    return str(ROOT / ".tools" / "ffmpeg-9.0.1-essentials_build" / "bin" / f"{name}.exe")


FFMPEG = _tool("ffmpeg")
FFPROBE = _tool("ffprobe")

PARALLEL = 4
# 转码参数（调这里改画质/分辨率）
TARGET_W = 640    # thumb 宽度（与 step02 的 1280x720 同 16:9 比例）
TARGET_H = 360    # thumb 高度
CRF = 40       # VP9 质量参数（0-63，越小越清晰越大；40 偏轻，透明区域省码）
FPS = 24       # 帧率（与 step02 一致，保持动作节奏）
AUDIO_BITRATE = "96k"  # Opus 音频码率（动画片段短，96k 足够；留空则用 ffmpeg 默认）


def convert_video(src: Path, dst: Path) -> None:
    """转码单个视频。

    注意：
    - 解码端必须指定 -c:v libvpx-vp9（libvpx 解码才能保留 VP9 alpha）；
      ffmpeg 自动选解码器会丢 alpha 导致黑底。
    - scale 滤镜默认也会丢 alpha，需 format=yuva420p 强制保留。
    """
    cmd = [
        FFMPEG,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-c:v",
        "libvpx-vp9",  # 关键：libvpx 解码才能保留 VP9 alpha
        "-i",
        str(src),
        "-vf",
        f"scale={TARGET_W}:{TARGET_H},format=yuva420p",
        "-c:v",
        "libvpx-vp9",  # VP9 编码（WebM 标准）
        "-crf",
        str(CRF),
        "-b:v",
        "0",  # 恒定质量模式（CRF）
        "-row-mt",
        "1",  # 多行并行（加速编码）
        "-r",
        str(FPS),
        # 保留音轨：WebM 容器用 Opus 承载，与 VP9 视频兼容。
        # 源没有音频时 ffmpeg 会忽略这些参数，不报错。
        "-c:a",
        "libopus",
        "-b:a",
        AUDIO_BITRATE,
        str(dst),
    ]
    result = subprocess.run(cmd, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())


def _is_valid(dst: Path, src: Path, min_size: int = 20_000) -> bool:
    """断点续跑完整性检查：存在、够大、不比源旧、且能被 ffprobe 读到视频流。"""
    if not dst.exists() or dst.stat().st_size <= min_size:
        return False
    if dst.stat().st_mtime < src.stat().st_mtime:
        return False
    r = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "stream=codec_name",
                        "-of", "csv=p=0", str(dst)], capture_output=True)
    return bool(r.stdout.strip())


def _process_one(video: Path) -> tuple[str, int, int, bool]:
    """处理单个视频（worker 函数），返回 (名字, 源大小, 输出大小, 是否跳过)。"""
    src_size = video.stat().st_size
    dst = OUT / video.name
    if _is_valid(dst, video):
        return video.name, src_size, 0, True
    convert_video(video, dst)
    return video.name, src_size, dst.stat().st_size, False


def main() -> int:
    OUT.mkdir(exist_ok=True)
    videos = sorted(SRC.glob("*.webm"))
    if not videos:
        print(f"No WebM inputs found in {SRC} (need transparent webm from pr_import_step02.py)")
        return 1

    src_total = 0
    out_total = 0
    total = len(videos)
    with ProcessPoolExecutor(max_workers=PARALLEL) as ex:
        for index, (name, src_size, out_size, skipped) in enumerate(ex.map(_process_one, videos), start=1):
            src_total += src_size
            out_total += out_size
            if skipped:
                print(f"[{index}/{total}] SKIP {name} (already encoded)", flush=True)
            else:
                print(f"[{index}/{total}] {name}  {src_size / 1e6:.1f}MB -> {out_size / 1e6:.1f}MB", flush=True)

    print(f"\n=== summary ===")
    print(f"inputs: {total}")
    print(f"source total: {src_total / 1e6:.1f}MB")
    print(f"thumb total: {out_total / 1e6:.1f}MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
