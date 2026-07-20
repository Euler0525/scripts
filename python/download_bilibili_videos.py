"""
1. https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc
2. Export as `bilibili-cookies.txt`
"""

import os
import subprocess


def get_uploader_videos(uploader_url, output_file="bilibili_links.txt"):
    """
    Get all video links from a Bilibili uploader

    Args:
        uploader_url: Uploader's homepage URL, e.g., https://space.bilibili.com/UID
        output_file: File path to save the links
    """
    print(f"Fetching uploader's video list...")

    command = [
        "yt-dlp",
        "--cookies", "bilibili-cookies.txt",
        "--flat-playlist",
        "--user-agent", "Mozilla/5.0",
        "--print", "url",
        uploader_url
    ]

    if not os.path.exists(output_file):
        print(f"Warning: File not found - {output_file}")
        print(f"Creating new file: {output_file}")
        with open(output_file, "w", encoding="utf-8") as f:
            pass

    try:
        result = subprocess.run(
            command, capture_output=True, text=True, check=True)
        urls = [line.strip()
                for line in result.stdout.split('\n') if line.strip()]

        # Save to file
        with open(output_file, "w", encoding="utf-8") as f:
            f.write('\n'.join(urls))

        print(f"[OK] Successfully fetched {len(urls)} video links")
        return urls
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Failed to fetch: {e}")
        return []


def download_bilibili_videos(links_file, output_dir="downloads"):
    """
    Batch download Bilibili videos

    Args:
        links_file: Path to txt file containing video links (one per line)
        output_dir: Directory to save downloaded videos
    """
    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Read video URLs from file
    try:
        with open(links_file, "r", encoding="utf-8") as f:
            urls = [line.strip() for line in f if line.strip()]
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    if not urls:
        print(f"No video links found in {links_file}")
        return

    print(f"Found {len(urls)} video links")

    # Download videos one by one
    for idx, url in enumerate(urls, 1):
        print(f"\n[{idx}/{len(urls)}] Downloading: {url}")

        command = [
            "yt-dlp",
            "--cookies", "bilibili-cookies.txt",
            "-f", "bestvideo+bestaudio/best",
            "--merge-output-format", "mp4",
            "-o", f"{output_dir}/%(title)s.%(ext)s",
            url
        ]

        try:
            subprocess.run(command, check=True)
            print(f"[OK] Download completed")
        except subprocess.CalledProcessError:
            print(f"[ERROR] Download failed: {url}")
        except Exception as e:
            print(f"[ERROR] Error occurred: {e}")


def download_bilibili_playlist(playlist_url, playlist_type, output_dir="downloads"):
    """Download all videos from a Bilibili favorites list or collection."""
    if not playlist_url:
        print(f"[ERROR] {playlist_type} URL cannot be empty")
        return

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    print(f"Downloading Bilibili {playlist_type}: {playlist_url}")
    command = [
        "yt-dlp",
        "--cookies", "bilibili-cookies.txt",
        "--yes-playlist",
        "--ignore-errors",
        "-f", "bestvideo+bestaudio/best",
        "--merge-output-format", "mp4",
        "-o", f"{output_dir}/%(playlist_title,playlist)s/%(title)s.%(ext)s",
        playlist_url
    ]

    try:
        subprocess.run(command, check=True)
        print(f"[OK] {playlist_type} download completed")
    except subprocess.CalledProcessError:
        print(f"[ERROR] {playlist_type} download failed: {playlist_url}")
    except Exception as e:
        print(f"[ERROR] Error occurred: {e}")


def main():
    print("\nBilibili downloader")
    print("1. Download videos from bilibili_links.txt")
    print("2. Download all videos from an uploader")
    print("3. Download a favorites list")
    print("4. Download a collection/series")
    choice = input("Please select [1-4] (default: 1): ").strip() or "1"

    if choice == "1":
        links_file = input(
            "Links file (default: bilibili_links.txt): ").strip()
        download_bilibili_videos(links_file or "bilibili_links.txt")
    elif choice == "2":
        uid = input("Please input UID: ").strip()
        uploader_url = f"https://space.bilibili.com/{uid}"
        links = get_uploader_videos(uploader_url, "bilibili_links.txt")
        if links:
            download_bilibili_videos("bilibili_links.txt")
    elif choice == "3":
        favorites_url = input("Please input the favorites list URL: ").strip()
        download_bilibili_playlist(favorites_url, "favorites list")
    elif choice == "4":
        collection_url = input(
            "Please input the collection/series URL: ").strip()
        download_bilibili_playlist(collection_url, "collection/series")
    else:
        print("[ERROR] Invalid selection")


if __name__ == "__main__":
    main()

