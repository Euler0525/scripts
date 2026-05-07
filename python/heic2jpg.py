import os
from PIL import Image
from pathlib import Path
from pillow_heif import register_heif_opener


register_heif_opener()

def convert_heic_to_jpg(heic_path, jpg_path):
    try:
        image = Image.open(heic_path)
        if image.mode in ('RGBA', 'LA', 'P'):
            image = image.convert('RGB')
        image.save(jpg_path, 'JPEG')
        return True
    except Exception as e:
        print(f"Convert {heic_path} failed!: {e}")
        return False


def batch_convert_heic(directory='.', output_dir=None):
    if output_dir is None:
        output_dir = directory

    Path(output_dir).mkdir(parents=True, exist_ok=True)

    heic_files = []
    for ext in ['*.HEIC']:
        heic_files.extend(Path(directory).glob(ext))

    if not heic_files:
        return

    print(f"{len(heic_files)} HEIC files.")

    success_count = 0
    for heic_path in heic_files:
        jpg_filename = heic_path.stem + '.jpg'
        jpg_path = Path(output_dir) / jpg_filename
        print(f"Converting: {heic_path.name} -> {jpg_filename}")

        if convert_heic_to_jpg(str(heic_path), str(jpg_path)):
            success_count += 1

    print(f"\n Convert {success_count}/{len(heic_files)} successfully!")


if __name__ == '__main__':
    batch_convert_heic('./HEIC', './JPG')

