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
        "--flat-playlist",
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

        print(f"✓ Successfully fetched {len(urls)} video links")
        return urls
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to fetch: {e}")
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
            "-f", "bestvideo+bestaudio/best",
            "--merge-output-format", "mp4",
            "-o", f"{output_dir}/%(title)s.%(ext)s",
            url
        ]

        try:
            subprocess.run(command, check=True)
            print(f"✓ Download completed")
        except subprocess.CalledProcessError:
            print(f"✗ Download failed: {url}")
        except Exception as e:
            print(f"✗ Error occurred: {e}")


if __name__ == "__main__":
    uid = input("Please input UID:")
    uploader_url = f"https://space.bilibili.com/{uid}"

    get_uploader_videos(uploader_url, "bilibili_links.txt")
    download_bilibili_videos("bilibili_links.txt")
