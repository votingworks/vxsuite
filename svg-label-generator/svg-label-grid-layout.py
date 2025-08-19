
#!/usr/bin/env python3
"""
SVG Label Grid Combiner for Laser Cutting (DOM-based, no regex)
- Parses SVGs with xml.etree.ElementTree
- Removes backgrounds/metadata by tags/attributes
- Inverts black/white fills & strokes by editing attributes and style strings
- Lays out labels on a grid with rounded cutting rectangles
"""

import os
import sys
import math
import argparse
from copy import deepcopy
from pathlib import Path
from xml.etree import ElementTree as ET

# ---------- Namespaces ----------
SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape"
SODIPODI_NS = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
XMLNS = "http://www.w3.org/2000/xmlns/"

ET.register_namespace('', SVG_NS)
ET.register_namespace('xlink', XLINK_NS)
ET.register_namespace('inkscape', INKSCAPE_NS)
ET.register_namespace('sodipodi', SODIPODI_NS)

def q(tag):
    return f"{{{SVG_NS}}}{tag}"

# ---------- Defaults ----------
DEFAULT_LABEL_WIDTH = 84.81
DEFAULT_LABEL_HEIGHT = 49.50
DEFAULT_LABEL_PADDING = 5.0
DEFAULT_CORNER_RADIUS = 2.54

DEFAULT_LASER_WIDTH = 813.0
DEFAULT_LASER_HEIGHT = 508.0

# Cutting offset - distance between label edge and cutting line (in mm)
CUTTING_OFFSET = 1.0  # 1mm offset on all sides


# ---------- File discovery / selection ----------
def find_svg_directories(base_path="."):
    """Return list of (rel_path, count) for dirs that contain .svg files."""
    results = []
    for root, _, files in os.walk(base_path):
        count = sum(1 for f in files if f.lower().endswith(".svg"))
        if count:
            rel = os.path.relpath(root, base_path)
            results.append((rel, count))
    return sorted(results)


def select_svg_directory():
    print("\nSearching for directories with SVG files...")
    dirs = find_svg_directories()
    if not dirs:
        print("No directories with SVG files found!")
        return None

    print("\nDirectories containing SVG files:")
    print("-" * 60)
    for i, (d, c) in enumerate(dirs, 1):
        print(f"{i}. {d} ({c} SVG files)")
    while True:
        choice = input(f"\nSelect directory (1-{len(dirs)}): ").strip()
        try:
            idx = int(choice) - 1
        except ValueError:
            print("Please enter a valid number")
            continue
        if 0 <= idx < len(dirs):
            sel = dirs[idx][0]
            print(f"Selected: {sel}")
            return sel
        print(f"Please enter a number between 1 and {len(dirs)}")


def get_svg_files(directory):
    return sorted(str(p) for p in Path(directory).glob("*.svg"))


# ---------- Input helpers ----------
def get_label_dimensions():
    print("\n" + "-" * 60)
    print("Label Dimensions")
    print("-" * 60)
    try:
        w = input(f"Enter label width in mm (press Enter for {DEFAULT_LABEL_WIDTH}mm): ").strip()
        label_w = float(w) if w else DEFAULT_LABEL_WIDTH
    except ValueError:
        label_w = DEFAULT_LABEL_WIDTH
        print(f"Invalid input, using default: {label_w}mm")

    try:
        h = input(f"Enter label height in mm (press Enter for {DEFAULT_LABEL_HEIGHT}mm): ").strip()
        label_h = float(h) if h else DEFAULT_LABEL_HEIGHT
    except ValueError:
        label_h = DEFAULT_LABEL_HEIGHT
        print(f"Invalid input, using default: {label_h}mm")

    print(f"Using label dimensions: {label_w}mm × {label_h}mm")
    return label_w, label_h


def get_user_inputs():
    print("\n" + "-" * 60)
    print("Grid Parameters")
    print("-" * 60)
    try:
        gw = input(f"Enter grid width in mm (Enter for {DEFAULT_LASER_WIDTH}): ").strip()
        grid_w = float(gw) if gw else DEFAULT_LASER_WIDTH
    except ValueError:
        grid_w = DEFAULT_LASER_WIDTH
        print(f"Using default: {grid_w}mm")

    try:
        gh = input(f"Enter grid height in mm (Enter for {DEFAULT_LASER_HEIGHT}): ").strip()
        grid_h = float(gh) if gh else DEFAULT_LASER_HEIGHT
    except ValueError:
        grid_h = DEFAULT_LASER_HEIGHT
        print(f"Using default: {grid_h}mm")

    try:
        p = input(f"Enter padding between labels in mm (Enter for {DEFAULT_LABEL_PADDING}): ").strip()
        padding = float(p) if p else DEFAULT_LABEL_PADDING
    except ValueError:
        padding = DEFAULT_LABEL_PADDING
        print(f"Using default: {padding}mm")
    if padding < 0:
        padding = DEFAULT_LABEL_PADDING
        print(f"Padding cannot be negative. Using default: {padding}mm")

    return grid_w, grid_h, padding


# ---------- Layout math ----------
def calculate_grid_layout(grid_width, grid_height, label_width, label_height, padding):
    effective_w = label_width + padding
    effective_h = label_height + padding
    cols = int((grid_width + padding) / effective_w)
    rows = int((grid_height + padding) / effective_h)

    used_w = cols * label_width + (cols - 1) * padding if cols else 0.0
    used_h = rows * label_height + (rows - 1) * padding if rows else 0.0

    margin_x = (grid_width - used_w) / 2 if cols else 0.0
    margin_y = (grid_height - used_h) / 2 if rows else 0.0
    return cols, rows, margin_x, margin_y, effective_w, effective_h


# ---------- Color helpers (no regex) ----------
def _norm_color(val):
    """Return 'black', 'white', or None based on the color value string."""
    if not val:
        return None
    s = val.strip().lower()
    if s in ("black", "#000", "#000000", "rgb(0,0,0)"):
        return "black"
    if s in ("white", "#fff", "#ffffff", "rgb(255,255,255)"):
        return "white"
    return None


def _invert_color(val):
    norm = _norm_color(val)
    if norm == "black":
        return "#FFFFFF"
    if norm == "white":
        return "#000000"
    return val  # leave other colors unchanged


def _parse_style(style_str):
    """Parse 'a:b; c:d' into dict; preserves unknown keys."""
    out = {}
    if not style_str:
        return out
    for part in style_str.split(";"):
        if not part.strip():
            continue
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def _style_to_str(d):
    return ";".join(f"{k}:{v}" for k, v in d.items())


def invert_colors_inplace(el):
    """Invert black/white for 'fill' and 'stroke', incl. style attr, recursively."""
    # Attributes
    if "fill" in el.attrib:
        el.set("fill", _invert_color(el.get("fill")))
    if "stroke" in el.attrib:
        el.set("stroke", _invert_color(el.get("stroke")))

    # Style attribute
    style = el.get("style")
    if style:
        sd = _parse_style(style)
        if "fill" in sd:
            sd["fill"] = _invert_color(sd["fill"])
        if "stroke" in sd:
            sd["stroke"] = _invert_color(sd["stroke"])
        el.set("style", _style_to_str(sd))

    # Recurse
    for child in list(el):
        invert_colors_inplace(child)


def _remove_elements_by_id(root, ids):
    """Remove any descendant elements whose id is in 'ids'."""
    parent_map = {child: parent for parent in root.iter() for child in parent}
    removed = 0
    for el in list(parent_map.keys()):
        if el.get("id") in ids:
            parent_map[el].remove(el)
            removed += 1
    return removed

# ---------- SVG extraction (no regex) ----------
def extract_label_group(svg_path, label_w, label_h):
    """Return a <g> containing the label's content with colors inverted and backgrounds removed."""
    tree = ET.parse(svg_path)
    root = tree.getroot()

    # Build result group
    out_g = ET.Element(q("g"))

    # Remove metadata-like elements by tag
    for child in list(root):
        tag = child.tag
        # Remove <metadata>, <defs>, <sodipodi:namedview> (ns-qualified)
        if tag == q("metadata") or tag == q("defs") or tag == f"{{{SODIPODI_NS}}}namedview":
            continue

        # Remove groups with inkscape label "BG Fill"
        if child.get(f"{{{INKSCAPE_NS}}}label") == "BG Fill":
            continue

        # Remove big black rectangles likely serving as backgrounds
        if tag == q("rect"):
            fill = child.get("fill") or _parse_style(child.get("style")).get("fill")
            if _norm_color(fill) == "black":
                try:
                    w = float(child.get("width", "0"))
                    h = float(child.get("height", "0"))
                except ValueError:
                    w = h = 0.0
                if (w >= 0.9 * label_w and h >= 0.9 * label_h):
                    continue  # skip background

        # Remove specific ids if they exist
        el_id = child.get("id", "")
        if el_id in ("path1", "path1-3"):
            continue

        # Keep (deep copy), remove specific artifacts anywhere inside, then invert colors
        kept = deepcopy(child)
        _remove_elements_by_id(kept, {"path1", "path1-3"})
        invert_colors_inplace(kept)
        out_g.append(kept)

    return out_g


# ---------- Grid building ----------
def create_svg_root(width_mm, height_mm):
    root = ET.Element(q("svg"), {
        "width": f"{width_mm}mm",
        "height": f"{height_mm}mm",
        "viewBox": f"0 0 {width_mm} {height_mm}",
    })
    return root


def create_rounded_rect(x, y, width, height, radius, stroke_color="red", stroke_width="1", fill="none"):
    return ET.Element(q("rect"), {
        "x": str(x), "y": str(y),
        "width": str(width), "height": str(height),
        "rx": str(radius), "ry": str(radius),
        "stroke": stroke_color, "stroke-width": str(stroke_width),
        "fill": fill
    })


def create_grid_svg(svg_files, grid_width, grid_height, label_width, label_height, padding, start_index, output_file):
    # Cutting rectangle dimensions
    cut_w = label_width + 2 * CUTTING_OFFSET
    cut_h = label_height + 2 * CUTTING_OFFSET

    cols, rows, margin_x, margin_y, eff_w, eff_h = calculate_grid_layout(
        grid_width, grid_height, cut_w, cut_h, padding
    )
    labels_per_grid = cols * rows
    end_index = min(start_index + labels_per_grid, len(svg_files))

    root = create_svg_root(grid_width, grid_height)
    grid_g = ET.SubElement(root, q("g"), {"id": "grid"})

    # Background (white)
    grid_g.append(ET.Element(q("rect"), {
        "x": "0", "y": "0",
        "width": str(grid_width), "height": str(grid_height),
        "fill": "white"
    }))

    label_index = start_index
    for r in range(rows):
        for c in range(cols):
            if label_index >= end_index:
                break

            # Cutting rectangle position
            cut_x = margin_x + c * eff_w
            cut_y = margin_y + r * eff_h
            grid_g.append(create_rounded_rect(cut_x, cut_y, cut_w, cut_h, DEFAULT_CORNER_RADIUS))

            # Label position (offset inside cutting rect)
            label_x = cut_x + CUTTING_OFFSET
            label_y = cut_y + CUTTING_OFFSET

            # Wrap label content in transform group
            slot_g = ET.SubElement(grid_g, q("g"), {"transform": f"translate({label_x},{label_y})"})

            # White background under content
            slot_g.append(ET.Element(q("rect"), {
                "x": "0", "y": "0",
                "width": str(label_width), "height": str(label_height),
                "fill": "white"
            }))

            # Import parsed content
            try:
                content_g = extract_label_group(svg_files[label_index], label_width, label_height)
            except ET.ParseError as e:
                print(f"Warning: could not parse '{svg_files[label_index]}': {e}")
                label_index += 1
                continue

            # Scale if requested size differs from template default
            if (label_width != DEFAULT_LABEL_WIDTH) or (label_height != DEFAULT_LABEL_HEIGHT):
                sx = label_width / DEFAULT_LABEL_WIDTH
                sy = label_height / DEFAULT_LABEL_HEIGHT
                scale_g = ET.Element(q("g"), {"transform": f"scale({sx},{sy})"})
                for child in list(content_g):
                    scale_g.append(child)  # reparent
                slot_g.append(scale_g)
            else:
                slot_g.append(content_g)

            label_index += 1

        if label_index >= end_index:
            break

    # Write SVG to file
    Path(output_file).write_text(ET.tostring(root, encoding="unicode"), encoding="utf-8")
    return end_index - start_index


# ---------- Main flow ----------
def main():
    print("=" * 60)
    print("SVG Label Grid Combiner for Laser Cutting (no regex)")
    print("=" * 60)

    input_dir = select_svg_directory()
    if not input_dir:
        print("No directory selected. Exiting.")
        sys.exit(1)

    svg_files = get_svg_files(input_dir)
    if not svg_files:
        print(f"No SVG files found in '{input_dir}'!")
        sys.exit(1)

    print(f"\nFound {len(svg_files)} SVG files to process.")
    label_w, label_h = get_label_dimensions()
    grid_w, grid_h, padding = get_user_inputs()

    # Layout with cutting rectangle
    cut_w = label_w + 2 * CUTTING_OFFSET
    cut_h = label_h + 2 * CUTTING_OFFSET
    cols, rows, _, _, _, _ = calculate_grid_layout(grid_w, grid_h, cut_w, cut_h, padding)
    labels_per_grid = cols * rows
    print(f"\nGrid layout: {cols} columns × {rows} rows = {labels_per_grid} labels per grid")
    print(f"Note: Cutting rectangles are {cut_w}mm × {cut_h}mm ({CUTTING_OFFSET}mm offset on all sides)")

    total_grids = math.ceil(len(svg_files) / labels_per_grid) if labels_per_grid else 0
    print(f"Will create {total_grids} grid file(s)")

    default_output = "labels"
    outdir_name = input(f"\nEnter output directory name (press Enter for '{default_output}'): ").strip() or default_output
    outdir = Path("outputs") / outdir_name
    outdir.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {outdir} (created if needed)")

    print("\nGenerating grid SVGs...")
    print("-" * 40)
    for g in range(total_grids):
        start = g * labels_per_grid
        out_file = outdir / f"grid_{g + 1:03d}.svg"
        added = create_grid_svg(svg_files, grid_w, grid_h, label_w, label_h, padding, start, str(out_file))
        print(f"Grid {g + 1}: Added {added} labels → {out_file}")

    print("\n" + "=" * 60)
    print(f"Success! Created {total_grids} grid file(s) in '{outdir}'")
    print("=" * 60)

    # Summary
    print("\nSummary:")
    print(f"  • Grid size: {grid_w}mm × {grid_h}mm")
    print(f"  • Label size: {label_w}mm × {label_h}mm")
    print(f"  • Cutting rectangle size: {cut_w}mm × {cut_h}mm")
    print(f"  • Cutting offset: {CUTTING_OFFSET}mm on all sides")
    print(f"  • Padding: {padding}mm")
    print(f"  • Labels per grid: {labels_per_grid} ({cols} × {rows})")
    print(f"  • Total labels processed: {len(svg_files)}")
    print(f"  • Grid files created: {total_grids}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
