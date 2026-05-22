import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ape"}
TARGET_LUFS_MIN = -30.0
TARGET_LUFS_MAX = -14.0
ANTI_CLIP_CEILING = 0.95


def check_ffmpeg():
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
    except FileNotFoundError:
        print("Error: ffmpeg is not installed or not in PATH.")
        print("Install it from https://ffmpeg.org/download.html")
        sys.exit(1)


def scan_directory(directory: Path) -> list[Path]:
    if not directory.is_dir():
        print(f"Error: '{directory}' is not a directory.")
        sys.exit(1)

    files = sorted(
        p for p in directory.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not files:
        print(f"Error: No supported audio files found in '{directory}'.")
        print(f"Supported formats: {', '.join(sorted(SUPPORTED_EXTENSIONS))}")
        sys.exit(1)

    return files


def decode_to_wav(input_path: Path, wav_path: Path) -> bool:
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(input_path),
                "-acodec", "pcm_f32le",
                str(wav_path),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            check=True,
        )
        return True
    except subprocess.CalledProcessError as e:
        print(
            f"  Warning: ffmpeg failed to decode '{input_path.name}': {e.stderr.decode().strip()}")
        return False


def measure_loudness(wav_path: Path) -> float | None:
    try:
        data, rate = sf.read(wav_path)
        meter = pyln.Meter(rate)
        loudness = meter.integrated_loudness(data)
        return loudness
    except Exception as e:
        print(f"  Warning: Failed to measure loudness: {e}")
        return None


def normalize_loudness(wav_path: Path, input_lufs: float, target_lufs: float) -> np.ndarray | None:
    try:
        data, rate = sf.read(wav_path)
        meter = pyln.Meter(rate)
        data_normalized = pyln.normalize.loudness(
            data, input_lufs, target_lufs)

        peak = np.max(np.abs(data_normalized))
        if peak > 1.0:
            data_normalized = data_normalized * (ANTI_CLIP_CEILING / peak)

        return data_normalized
    except Exception as e:
        print(f"  Warning: Failed to normalize: {e}")
        return None


def encode_from_data(
    data: np.ndarray, rate: int, wav_path: Path, output_path: Path, original_path: Path
) -> bool:
    try:
        sf.write(wav_path, data, rate)

        codec_args = []
        ext = output_path.suffix.lower()
        if ext == ".flac":
            codec_args = ["-c:a", "flac", "-compression_level", "8"]
        elif ext == ".ape":
            codec_args = ["-c:a", "ape", "-compression_level", "5000"]
        elif ext == ".wav":
            codec_args = ["-c:a", "pcm_s24le"]
        elif ext == ".mp3":
            codec_args = ["-c:a", "libmp3lame", "-q:a", "0"]

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(original_path),
                "-i", str(wav_path),
                "-map", "1:a",
                "-map_metadata", "0",
                "-map", "0:v?",
                "-c:v", "copy",
                *codec_args,
                str(output_path),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            check=True,
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"  Warning: ffmpeg encode failed: {e.stderr.decode().strip()}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Normalize audio files to uniform loudness."
    )
    parser.add_argument(
        "directory",
        type=Path,
        help="Directory containing audio files to normalize.",
    )
    args = parser.parse_args()

    check_ffmpeg()
    directory = args.directory.resolve()
    files = scan_directory(directory)
    total = len(files)
    print(f"Found {total} audio file(s) in '{directory}'.\n")

    measurements: list[tuple[Path, float]] = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for i, filepath in enumerate(files, 1):
            wav_path = Path(tmpdir) / f"measure_{i}.wav"
            print(f"[{i}/{total}] Measuring: {filepath.name} ... ",
                  end="", flush=True)

            if not decode_to_wav(filepath, wav_path):
                print("SKIPPED (decode failed)")
                continue

            lufs = measure_loudness(wav_path)
            if lufs is None or np.isinf(lufs) or np.isnan(lufs):
                print("SKIPPED (measurement failed)")
                continue

            print(f"{lufs:.1f} LUFS")
            measurements.append((filepath, lufs))

    if not measurements:
        print("\nError: Could not measure any files.")
        sys.exit(1)

    lufs_values = np.array([m[1] for m in measurements])
    q_lo, q_hi = np.percentile(lufs_values, [10, 90])
    trimmed = lufs_values[(lufs_values >= q_lo) & (lufs_values <= q_hi)]
    avg_lufs = float(np.mean(trimmed)) if len(trimmed) > 0 else float(np.mean(lufs_values))
    target_lufs = float(np.clip(avg_lufs, TARGET_LUFS_MIN, TARGET_LUFS_MAX))
    print(f"\nLUFS range: {lufs_values.min():.1f} ~ {lufs_values.max():.1f}")
    print(f"Trimmed average LUFS: {avg_lufs:.1f} (from {len(trimmed)}/{len(lufs_values)} files)")
    print(f"Target LUFS:  {target_lufs:.1f}\n")

    results: list[tuple[Path, float, float]] = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for i, (filepath, input_lufs) in enumerate(measurements, 1):
            bak_path = filepath.with_suffix(filepath.suffix + ".bak")

            if bak_path.exists():
                print(
                    f"[{i}/{total}] SKIPPED {filepath.name} (.bak already exists)")
                continue

            print(f"[{i}/{total}] Normalizing: {filepath.name} ... ",
                  end="", flush=True)

            decode_wav = Path(tmpdir) / f"norm_input_{i}.wav"
            encode_wav = Path(tmpdir) / f"norm_output_{i}.wav"

            if not decode_to_wav(filepath, decode_wav):
                print("SKIPPED (decode failed)")
                continue

            normalized = normalize_loudness(
                decode_wav, input_lufs, target_lufs)
            if normalized is None:
                print("SKIPPED (normalization failed)")
                continue

            tmp_output = Path(tmpdir) / f"output_{i}{filepath.suffix}"
            _, rate = sf.read(decode_wav)
            if not encode_from_data(normalized, rate, encode_wav, tmp_output, filepath):
                print("SKIPPED (encode failed)")
                continue

            filepath.rename(bak_path)
            tmp_output.rename(filepath)

            adjustment = target_lufs - input_lufs
            print(
                f"done ({input_lufs:+.1f} -> {target_lufs:+.1f}, {adjustment:+.1f} dB)")
            results.append((filepath, input_lufs, target_lufs))

    if results:
        print(f"\n{'File':<40} {'Original':>10} {'Target':>10} {'Adjust':>10}")
        print("-" * 72)
        for filepath, input_lufs, target in results:
            adjustment = target - input_lufs
            print(
                f"{filepath.name:<40} {input_lufs:>+10.1f} {target:>+10.1f} {adjustment:>+10.1f}")
        print(
            f"\nDone. {len(results)} file(s) normalized. Originals saved as .bak.")
    else:
        print("\nNo files were normalized.")


if __name__ == "__main__":
    main()

