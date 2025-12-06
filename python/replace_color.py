from PIL import Image

def hex_to_rgb(hex_color: str):
    """Convert a hex color string (#RRGGBB) to an RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def replace_color(input_path: str, output_path: str, src_hex: str, dst_hex: str):
    """Replace a specific color in a PNG image with another color."""
    src_color = hex_to_rgb(src_hex)
    dst_color = hex_to_rgb(dst_hex)

    img = Image.open(input_path).convert("RGBA")
    pixels = img.load()

    width, height = img.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if (r, g, b) == src_color:
                pixels[x, y] = (*dst_color, a)

    img.save(output_path)
    print(f"Color replaced and saved to: {output_path}")

if __name__ == "__main__":
    replace_color("input.png", "output.png", "#FFFFFF", "#000000")
