"""Remove green backgrounds from step01 videos into transparent WebM files in step02/.

重要：帧尺寸必须按源视频实际分辨率逐帧读取。曾经硬编码 1280x720，而素材实际是
1260x720，每帧多读 16 行，画面在管道里逐帧下滑，产物是斜向彩色条纹。现在用
ffprobe 探测真实宽高，并在编码端使用同一尺寸。
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "step01"
OUT = ROOT / "step02"


def _tool(name: str) -> str:
    """解析 ffmpeg / ffprobe：优先 PATH，找不到时退回原工程自带的 .tools。"""
    found = shutil.which(name)
    if found:
        return found
    return str(ROOT / ".tools" / "ffmpeg-9.0.1-essentials_build" / "bin" / f"{name}.exe")


FFMPEG = _tool("ffmpeg")
FFPROBE = _tool("ffprobe")

PARALLEL = 4
# 帧尺寸不再硬编码：由 probe_size() 按源视频实际分辨率决定（本批素材为 1260x720）。
FPS = 24
AUDIO_BITRATE = "128k"  # Opus 音频码率（动画片段短，128k 体积只多约 2%）
# 视频质量：CRF 30 下实测 PSNR ≈ 46.7~47.2dB，肉眼已难分辨；
# 保持源分辨率不做缩放，段落播放时不会发虚。
CRF = 30
# HSV 色相判定抠像：只把"绿色色相 + 足够饱和/明度"的像素判为背景（透明）。
# 相比 chromakey(YUV 色度距离) 和 RGB 色差阈值：它们是"以绿幕为中心画圈"，
# 蓝色/白色等彩色可能落入圈内被误抠；HSV 色相判定只认绿色方向，蓝/白/红永不误抠。
GREEN_HUE_MIN = 70.0   # 绿色色相下界
GREEN_HUE_MAX = 170.0  # 绿色色相上界
SAT_MIN = 0.15         # 饱和度下界（低于此的白色/浅色不算背景）
VAL_MIN = 0.15         # 明度下界
HUE_FEATHER = 6.0     # 色相边界渐变（度）：越大边缘过渡越柔和
SPILL_STRENGTH = 1.0   # 绿溢压制强度（0=关闭，1=完全压制）
# 轮廓伸缩（等价于 PR Ultra Key 的 Choke / Expansion），单位：像素，必须是整数
#   >0 收缩轮廓，把残留的实心绿边一起吃掉（choke）
#   <0 外扩轮廓，用于补回被抠瘦的头发丝（expansion）
EDGE_SHRINK = 1

# 边缘「绿边」的成因：轮廓边缘是绿幕与角色色的混合像素，绿色分量偏高但色相
# 已经跑到窗口外，于是被当成实心保留，看起来发绿。压制方式是把绿色分量钳制到
# 红/蓝最大值以内（白色、青色、蓝色本身不受影响），轮廓不变但不再泛绿。


def read_exact(stream, n):
    """阻塞读满 n 字节（管道 read 可能部分返回，必须循环）。EOF 时返回不足。"""
    buf = b""
    while len(buf) < n:
        chunk = stream.read(n - len(buf))
        if not chunk:
            break
        buf += chunk
    return buf


def _rgb_to_yuv(frame: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """rgb24 (H,W,3) → Y/U/V 平面（BT.601 limited）。U/V 用 2x2 平均做 4:2:0 子采样。"""
    h, w = frame.shape[:2]
    r = frame[..., 0].astype(np.float32)
    g = frame[..., 1].astype(np.float32)
    b = frame[..., 2].astype(np.float32)
    y = np.clip(16 + 0.257 * r + 0.504 * g + 0.098 * b, 16, 235).astype(np.uint8)
    u = np.clip(128 - 0.148 * r - 0.291 * g + 0.439 * b, 16, 240)
    v = np.clip(128 + 0.439 * r - 0.368 * g - 0.071 * b, 16, 240)
    u = u.reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3)).astype(np.uint8)
    v = v.reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3)).astype(np.uint8)
    return y, u, v


def _despill(frame: np.ndarray) -> np.ndarray:
    """绿溢压制：把绿色分量钳制到红/蓝最大值以内。

    只削掉「多余的绿」，不改 alpha、不动轮廓。白色（r=g=b）与青色（b 高、r 低）
    基本不受影响，因此雨伞、白裙等细部不会被压灰。
    """
    if SPILL_STRENGTH <= 0:
        return frame
    f = frame.astype(np.float32)
    cap = np.maximum(f[..., 0], f[..., 2])
    excess = np.maximum(f[..., 1] - cap, 0.0) * SPILL_STRENGTH
    f[..., 1] -= excess
    return np.clip(f, 0, 255).astype(np.uint8)


def _apply_edge_shift(alpha: np.ndarray, r: int) -> np.ndarray:
    """对 alpha 做最小/最大滤波，实现轮廓收缩或外扩。

    - r > 0：取邻域最小值 → 半透明区域向内收，轮廓变瘦（choke）
    - r < 0：取邻域最大值 → 轮廓变胖（expansion）
    画面外一律按「不参与」处理（收缩时当不透明、外扩时当透明），
    避免角色贴边时被画面对侧的内容影响。
    """
    if r == 0:
        return alpha
    h, w = alpha.shape
    k = abs(r)
    pad_value = 255 if r > 0 else 0
    pad = np.full((h + 2 * k, w + 2 * k), pad_value, np.uint8)
    pad[k:k + h, k:k + w] = alpha
    out = pad[k:k + h, k:k + w].copy()
    for dy in range(0, 2 * k + 1):
        for dx in range(0, 2 * k + 1):
            # 只取圆形邻域，避免方形核把直角变成方块
            if (dy - k) ** 2 + (dx - k) ** 2 > k * k:
                continue
            win = pad[dy:dy + h, dx:dx + w]
            np.minimum(out, win, out=out) if r > 0 else np.maximum(out, win, out=out)
    return out


def probe_size(video: Path) -> tuple[int, int]:
    """读取源视频实际分辨率（宽, 高）。

    管道按 W*H*3 切帧，尺寸错一个像素整段画面就会错位，所以必须实测而非假设。
    """
    cmd = [
        FFPROBE, "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(video),
    ]
    result = subprocess.run(cmd, check=False, capture_output=True, text=True, encoding="utf-8", errors="replace")
    raw = result.stdout.strip().splitlines()
    if result.returncode != 0 or not raw:
        raise RuntimeError(f"ffprobe failed for {video.name}: {result.stderr.strip()}")
    w, h = raw[0].split("x")[:2]
    width, height = int(w), int(h)
    if width % 2 or height % 2:
        raise RuntimeError(f"{video.name}: odd frame size {width}x{height} not supported by yuv420p")
    return width, height


def _rgb_to_hsv(frame: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """rgb24 (H,W,3) → hue(0-360), saturation(0-1), value(0-1)，numpy 向量化。"""
    r = frame[..., 0].astype(np.float32) / 255.0
    g = frame[..., 1].astype(np.float32) / 255.0
    b = frame[..., 2].astype(np.float32) / 255.0
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    delta = mx - mn
    hue = np.zeros_like(mx)
    nz = delta > 0
    with np.errstate(divide="ignore", invalid="ignore"):
        hr = 60.0 * (((g - b) / np.where(nz, delta, 1)) % 6.0)
        hg = 60.0 * (((b - r) / np.where(nz, delta, 1)) + 2.0)
        hb = 60.0 * (((r - g) / np.where(nz, delta, 1)) + 4.0)
    hue = np.where((mx == r) & nz, hr, np.where((mx == g) & nz, hg, np.where((mx == b) & nz, hb, 0.0)))
    sat = np.where(mx > 0, delta / np.maximum(mx, 1e-6), 0.0)
    return hue, sat, mx


def mux_audio(src: Path, video: Path, dst: Path) -> None:
    """把源视频的音轨合并进透明视频。

    抠像走的是「原始 RGB 帧管道 → 编码器」，音频无法穿过这条管道，所以这里
    单独再跑一次 ffmpeg：视频流直接 copy（不重编码，alpha 不丢），音频转成
    Opus 写进 WebM。源没有音轨时 `1:a?` 会静默跳过，输出仍是纯视频。
    """
    cmd = [
        FFMPEG,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video),
        "-i",
        str(src),
        "-map",
        "0:v:0",
        "-map",
        "1:a?",
        "-c:v",
        "copy",
        "-c:a",
        "libopus",
        "-b:a",
        AUDIO_BITRATE,
        # 音画时长略有差异时以视频为准，避免尾巴多出静音。
        "-shortest",
        str(dst),
    ]
    result = subprocess.run(cmd, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())


def convert_video(src: Path, dst: Path, width: int, height: int) -> None:
    """HSV 色相判定抠像：绿色色相 + 足够饱和/明度 → 透明。

    输入管道：step01 视频 rgb24 流；输出管道：yuva420p → VP9 透明 webm。
    宽高由调用方按 ffprobe 实测值传入，读帧与编码两端必须完全一致。
    视频先写到临时文件，合并音轨后才落到 dst：中途中断不会留下半成品，
    也就不会被断点续跑误判成「已完成」。
    """
    temp = dst.with_name(dst.stem + ".tmp.webm")
    temp.unlink(missing_ok=True)
    p1 = subprocess.Popen(
        [FFMPEG, "-loglevel", "error", "-i", str(src), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE)
    p2 = subprocess.Popen(
        [FFMPEG, "-y", "-loglevel", "error",
         "-f", "rawvideo", "-pix_fmt", "yuva420p", "-s", f"{width}x{height}", "-r", str(FPS), "-i", "-",
         "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", str(CRF), "-b:v", "0",
         # 不关闭 alt-ref：默认开启，同等 CRF 下体积约小 15% 且画质不变。
         "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", str(temp)],
        stdin=subprocess.PIPE)

    frame_size = width * height * 3
    # 色相跨 0 度处理：绿色范围 [70,170]，两侧各留 HUE_FEATHER 渐变
    lo = GREEN_HUE_MIN - HUE_FEATHER
    hi = GREEN_HUE_MAX + HUE_FEATHER
    while True:
        buf = read_exact(p1.stdout, frame_size)
        if len(buf) < frame_size:
            break
        frame = np.frombuffer(buf, np.uint8).reshape(height, width, 3)
        # 注意：先按原图算 mask，再做绿溢压制。压制会改变色相，顺序反了会漏抠。
        hue, sat, val = _rgb_to_hsv(frame)
        # 背景 = 绿色色相内 且 饱和度/明度达标；色相边界做线性渐变
        in_hue = np.clip((hue - lo) / HUE_FEATHER, 0, 1) * np.clip((hi - hue) / HUE_FEATHER, 0, 1)
        bg_mask = (sat >= SAT_MIN) & (val >= VAL_MIN) & (hue >= lo) & (hue <= hi)
        # 背景 → alpha 0（透明）；绿色色相中心全透明，边缘渐变；非背景 → 255
        alpha = np.where(bg_mask, (1.0 - in_hue) * 255, 255).astype(np.uint8)
        # 轮廓收缩/外扩：削掉边缘残留的实心绿边（choke）
        alpha = _apply_edge_shift(alpha, EDGE_SHRINK)
        y, u, v = _rgb_to_yuv(_despill(frame))
        p2.stdin.write(y.tobytes() + u.tobytes() + v.tobytes() + alpha.tobytes())
    p1.stdout.close()
    p2.stdin.close()
    rc = p1.wait() + p2.wait()
    if rc != 0:
        temp.unlink(missing_ok=True)
        raise RuntimeError(f"convert failed rc={rc}: {src.name}")

    # 视频编码完成后再把源音轨合并进来，得到最终产物。
    try:
        mux_audio(src, temp, dst)
    finally:
        temp.unlink(missing_ok=True)


def _is_valid(dst: Path, src: Path, size: tuple[int, int], min_size: int = 50_000) -> bool:
    """断点续跑完整性检查：存在、够大、不比源旧、有视频流、且分辨率与源一致。

    分辨率必须比对：曾经因为尺寸读错产出的斜条纹坏文件同样能被 ffprobe 读到
    视频流，只校验「有流」会让坏文件永远被 SKIP。
    """
    if not dst.exists() or dst.stat().st_size <= min_size:
        return False
    if dst.stat().st_mtime < src.stat().st_mtime:
        return False
    r = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(dst)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    raw = r.stdout.strip().splitlines()
    return bool(raw) and raw[0].strip() == f"{size[0]}x{size[1]}"


def _process_one(job: tuple[Path, Path]) -> None:
    """处理单个视频（worker 函数，必须模块级以支持 Windows spawn）。"""
    video, out = job
    dst = out / (video.stem + ".webm")
    width, height = probe_size(video)
    if _is_valid(dst, video, (width, height)):
        return
    convert_video(video, dst, width, height)


def main() -> int:
    # 可直接指定输入/输出目录：python chroma_step02.py <源目录> <输出目录>
    src = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SRC
    out = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else OUT
    out.mkdir(exist_ok=True)

    videos = sorted(src.glob("*.mp4"))
    if not videos:
        return 1

    with ProcessPoolExecutor(max_workers=PARALLEL) as ex:
        list(ex.map(_process_one, [(video, out) for video in videos]))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
