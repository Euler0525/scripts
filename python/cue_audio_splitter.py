import os
import re
from typing import List, Tuple, Optional, Union
from pydub import AudioSegment


def get_all_audio_files(root_dir: str) -> List[str]:
    """Recursively collect paths of all .flac and .wav audio files in the directory.

    Args:
        root_dir: Root directory to start searching from

    Returns:
        List of absolute paths to audio files (.flac, .wav)
    """
    audio_extensions = ('.flac', '.wav')
    audio_files = []

    # Traverse all subdirectories starting from root_dir
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            # Check if file has a supported audio extension
            if filename.lower().endswith(audio_extensions):
                audio_path = os.path.join(dirpath, filename)
                audio_files.append(audio_path)

    return audio_files


def group_audio_files_by_directory(audio_files: List[str]) -> dict:
    """Group audio files by their parent directory.

    Args:
        audio_files: List of audio file paths

    Returns:
        Dictionary with directory paths as keys and list of audio files in that directory as values
    """
    dir_groups = {}
    for file_path in audio_files:
        dir_path = os.path.dirname(file_path)
        if dir_path not in dir_groups:
            dir_groups[dir_path] = []
        dir_groups[dir_path].append(file_path)
    return dir_groups


def delete_backup_files(root_dir: str) -> None:
    """Delete backup files with names ending with (1) and extensions .flac, .wav, .cue, .md, .jpg.

    Args:
        root_dir: Root directory to search for backup files
    """
    # Regex pattern to match files ending with (1) and specific extensions (case-insensitive)
    pattern = re.compile(r'^(.*)\(1\)\.(flac|wav|cue|md|jpg)$', re.IGNORECASE)

    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if pattern.match(filename):
                file_path = os.path.join(dirpath, filename)
                try:
                    os.remove(file_path)
                    print(f"Deleted backup file: {file_path}")
                except Exception as e:
                    print(f"Failed to delete {file_path}: {str(e)}")


def clean_filename(s: str) -> str:
    """Clean and normalize filenames by removing unwanted content and handling special characters.

    Processing steps:
    1. Remove web links (http/https URLs, www domains)
    2. Remove specific unwanted strings: "群星", "佚名"
    3. Replace " - " (hyphen with surrounding spaces) with "-"
    4. Replace remaining spaces with underscores
    5. Remove invalid filesystem characters (replace with underscores)
    6. Strip leading/trailing whitespace

    Args:
        s: Original string to clean

    Returns:
        Cleaned string safe for filesystem use
    """
    # Step 1: Remove web links (http/https URLs and www domains)
    s = re.sub(r'https?://\S+|www\.\S+', '', s)

    # Step 2: Remove specific unwanted strings
    unwanted = {"群星", "佚名"}
    for item in unwanted:
        s = s.replace(item, '')

    # Step 3: Handle hyphens with surrounding spaces (1+ spaces on either side)
    s = re.sub(r'\s+-\s+', '-', s)

    # Step 4: Replace remaining spaces with underscores
    s = s.replace(' ', '_')

    # Step 5: Remove invalid filesystem characters (e.g., / : * ? " < > |)
    invalid_chars = r'[\/:*?"<>|]'
    s = re.sub(invalid_chars, '_', s)

    # Step 6: Remove leading/trailing whitespace and consecutive underscores
    s = s.strip().replace('__', '_')  # Clean up double underscores from removals

    return s


def parse_cue(cue_path: str) -> List[Tuple[str, float, str, str]]:
    """Parse CUE sheet file to extract track information.

    Extracts track number, start time (in seconds), title, and performer for each track.
    Uses global PERFORMER from CUE if track-specific PERFORMER is missing.

    Args:
        cue_path: Path to .cue file

    Returns:
        List of tuples containing track info:
        [(track_number, start_seconds, title, performer), ...]
        Empty list if parsing fails
    """
    # Try multiple encodings to handle different CUE file encodings
    encodings = ['utf-8', 'gbk', 'latin-1']
    cue_content: Optional[List[str]] = None

    for encoding in encodings:
        try:
            with open(cue_path, 'r', encoding=encoding) as f:
                cue_content = f.readlines()
            break  # Stop if encoding works
        except UnicodeDecodeError:
            continue  # Try next encoding

    if cue_content is None:
        print(f"Failed to parse CUE file (encoding issue): {cue_path}")
        return []

    # Extract global performer (album-level)
    global_performer = ""
    global_pattern = re.compile(r'^(PERFORMER|TITLE)\s+"(.*?)"', re.IGNORECASE)
    for line in cue_content:
        line = line.strip()
        match = global_pattern.match(line)
        if match and match.group(1).upper() == 'PERFORMER':
            global_performer = match.group(2).strip()
            break  # Use first global performer found

    # Extract track-specific information
    tracks: List[Tuple[str, float, str, str]] = []
    current_track_num: Optional[str] = None
    current_title = ""
    # Track-level performer (takes precedence over global)
    current_performer = ""
    current_start_sec = 0.0

    # Regex patterns for parsing CUE content
    time_pattern = re.compile(r'INDEX 01 (\d+:\d+:\d+)', re.IGNORECASE)
    track_pattern = re.compile(r'TRACK (\d+)', re.IGNORECASE)
    field_pattern = re.compile(r'^(TITLE|PERFORMER)\s+"(.*?)"', re.IGNORECASE)

    for line in cue_content:
        line = line.strip()

        # Match track number (e.g., "TRACK 01 AUDIO")
        track_match = track_pattern.match(line)
        if track_match:
            # Save previous track if it exists
            if current_track_num is not None:
                tracks.append((
                    current_track_num,
                    current_start_sec,
                    current_title,
                    current_performer or global_performer  # Fallback to global
                ))
            # Initialize new track
            current_track_num = track_match.group(1)
            current_title = ""
            current_performer = ""
            current_start_sec = 0.0
            continue

        # Match TITLE or PERFORMER within track definition
        field_match = field_pattern.match(line)
        if field_match and current_track_num is not None:
            field_name = field_match.group(1).upper()
            field_value = field_match.group(2).strip()
            if field_name == 'TITLE':
                current_title = field_value
            elif field_name == 'PERFORMER':
                current_performer = field_value
            continue

        # Match start time (e.g., "INDEX 01 00:00:00")
        time_match = time_pattern.search(line)
        if time_match and current_track_num is not None:
            time_str = time_match.group(1)
            # Convert MM:SS:FF (frames) to seconds (1 second = 75 frames)
            mm, ss, ff = map(int, time_str.split(':'))
            current_start_sec = mm * 60 + ss + ff / 75
            continue

    # Add the last track
    if current_track_num is not None:
        tracks.append((
            current_track_num,
            current_start_sec,
            current_title,
            current_performer or global_performer
        ))

    # Sort tracks by track number (numerical order)
    try:
        tracks.sort(key=lambda x: int(x[0]))
    except ValueError:
        print(f"Invalid track number format in CUE: {cue_path}")
        return []

    return tracks


def split_audio_by_cue(audio_path: str, cue_tracks: List[Tuple[str, float, str, str]], cd_prefix: str) -> bool:
    """Split audio file into segments based on CUE track information.

    Exports split segments with filenames formatted as:
    "CDxx-XX-title-performer.ext" where:
    - CDxx = 2-digit source file number prefix (per directory)
    - XX = 2-digit track number
    - title = cleaned track title from CUE
    - performer = cleaned performer from CUE (optional)

    Args:
        audio_path: Path to source audio file (.flac or .wav)
        cue_tracks: Track info from parse_cue()
        cd_prefix: Prefix with source file number (format: "CDxx-")

    Returns:
        True if at least one track was successfully exported, False otherwise
    """
    try:
        ext = os.path.splitext(audio_path)[1].lower()
        # Load audio file based on extension
        if ext == '.flac':
            audio = AudioSegment.from_file(audio_path, format='flac')
        elif ext == '.wav':
            audio = AudioSegment.from_wav(audio_path)
        else:
            print(f"Unsupported format: {audio_path}")
            return False
    except Exception as e:
        print(f"Failed to load audio {audio_path}: {str(e)}")
        return False

    total_duration = len(audio) / 1000  # Total duration in seconds
    dir_name = os.path.dirname(audio_path)
    base_ext = ext
    success = False  # Flag for successful export

    # Process each track
    for i, (track_num, start_sec, title, performer) in enumerate(cue_tracks):
        # Format track number as 2-digit string (e.g., "01", "10")
        try:
            track_num_padded = f"{int(track_num):02d}"
        except ValueError:
            print(f"Invalid track number {track_num}, skipping")
            continue

        # Clean title (use default if empty)
        original_base = os.path.splitext(os.path.basename(audio_path))[0]
        clean_title = clean_filename(
            title) if title else f"untitled_{track_num_padded}"

        # Clean performer (include only if exists)
        clean_performer = clean_filename(performer) if performer else ""
        performer_part = f"-{clean_performer}" if clean_performer else ""

        # Construct output filename with CD prefix and path
        output_name = f"{cd_prefix}{track_num_padded}-{clean_title}{performer_part}{base_ext}"
        output_path = os.path.join(dir_name, output_name)

        # Calculate start/end times in milliseconds
        start_ms = start_sec * 1000
        if i < len(cue_tracks) - 1:
            end_sec = cue_tracks[i+1][1]
            end_ms = end_sec * 1000
        else:
            end_ms = total_duration * 1000  # Last track ends at file end

        # Validate time range
        if start_ms >= end_ms or start_ms >= total_duration * 1000:
            print(
                f"Invalid time range, skipping track {track_num_padded}: {audio_path}")
            continue

        # Export split segment
        try:
            split_audio = audio[start_ms:end_ms]
            # Format without leading dot
            split_audio.export(output_path, format=base_ext[1:])
            # print(f"Generated: {output_path}")
            success = True  # Mark as successful if any track exports
        except Exception as e:
            print(f"Failed to export {output_path}: {str(e)}")

    return success


def backup_source_files(audio_path: str, cue_path: str) -> None:
    """Backup original audio and CUE files by renaming to .bak extensions.

    Skips backup if .bak file already exists.

    Args:
        audio_path: Path to original audio file
        cue_path: Path to original CUE file
    """
    # Backup audio file
    audio_bak = f"{audio_path}.bak"
    if os.path.exists(audio_path):
        try:
            if os.path.exists(audio_bak):
                print(f"Backup exists, skipping: {audio_bak}")
            else:
                os.rename(audio_path, audio_bak)
                # print(f"Backed up audio: {audio_bak}")
        except Exception as e:
            print(f"Failed to backup audio {audio_path}: {str(e)}")

    # Backup CUE file
    cue_bak = f"{cue_path}.bak"
    if os.path.exists(cue_path):
        try:
            if os.path.exists(cue_bak):
                print(f"Backup exists, skipping: {cue_bak}")
            else:
                os.rename(cue_path, cue_bak)
                # print(f"Backed up CUE: {cue_bak}")
        except Exception as e:
            print(f"Failed to backup CUE {cue_path}: {str(e)}")


def main(root_dir: str) -> None:
    """Main function to process audio files and split using CUE sheets.

    Workflow:
    1. Delete backup files ending with (1)
    2. Find all audio files recursively
    3. Group audio files by their parent directory
    4. For each directory:
        a. Sort audio files in the directory by filename (case-insensitive)
        b. Process each audio file with directory-specific CD numbering
        c. Check for matching CUE file and split if valid
        d. Backup original files if splitting succeeds

    Args:
        root_dir: Root directory to process
    """
    # First delete backup files ending with (1)
    print("Deleting backup files with names ending with (1)...")
    delete_backup_files(root_dir)

    audio_files = get_all_audio_files(root_dir)
    # Group audio files by their parent directory
    dir_groups = group_audio_files_by_directory(audio_files)
    print(
        f"Found {len(audio_files)} audio files across {len(dir_groups)} directories")

    # Process each directory separately
    for dir_path, dir_audio_files in dir_groups.items():
        # Sort audio files in current directory by filename (case-insensitive)
        dir_audio_files.sort(key=lambda x: os.path.basename(x).lower())
        print(
            f"\nProcessing directory: {dir_path} with {len(dir_audio_files)} audio files")

        # Process each audio file in this directory with CD numbering (per directory)
        for cd_index, audio_path in enumerate(dir_audio_files, 1):
            # Create CD prefix with 2-digit numbering (unique within current directory)
            cd_prefix = f"CD{cd_index:02d}-"

            # Check for matching CUE file (same name, .cue extension)
            cue_path = os.path.splitext(audio_path)[0] + '.cue'
            if not os.path.exists(cue_path):
                print(f"No matching CUE file, skipping: {audio_path}")
                continue

            # Parse CUE sheet for track information
            cue_tracks = parse_cue(cue_path)
            if not cue_tracks:
                print(f"No valid track info in CUE, skipping: {cue_path}")
                continue

            # Split audio with directory-specific CD prefix and check success
            print(f"Starting split: {audio_path} ({len(cue_tracks)} tracks)")
            split_success = split_audio_by_cue(
                audio_path, cue_tracks, cd_prefix)

            # Backup source files only if split succeeded
            if split_success:
                backup_source_files(audio_path, cue_path)
            else:
                print(f"Split failed, not backing up: {audio_path}")


if __name__ == "__main__":
    target_directory = input("Enter root directory to process: ").strip()
    if os.path.isdir(target_directory):
        main(target_directory)
    else:
        print("Invalid directory path!")
