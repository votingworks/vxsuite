#!/usr/bin/env python3
"""
SVG Label Generator (simple + interactive, with clean KeyboardInterrupt handling)
- No type hints
- Uses element IDs/tags (no regex) to edit SVG
- Interactive file selection and optional output-dir prompt
- KeyboardInterrupt bubbles to main; main handles it cleanly
- Ensures exactly one space between machine and version (by prefixing version with a single space)
"""

import argparse
import csv
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
import qrcode

# ---- Defaults ----
IDS_DIR = Path("./assets/ids")
TPL_DIR = Path("./assets/templates")
OUT_DIR = Path("./outputs/labels")
DEFAULT_MACHINE = "VxScan"
DEFAULT_VERSION = "v4.0.2"

# ---- IDs present in the template ----
ID_MACHINE = "tspan2"       # machine name
ID_VERSION = "tspan1"       # version
ID_SERIAL  = "tspan7"       # serial placeholder
ID_EXAMPLE_TEXT = "text8-5" # "Example" callout to remove
LEGACY_QR_IDS = set("path{}".format(i) for i in range(13, 38))  # path13..path37

# ---- QR placement box (from template's QR area) ----
QR_X_START = 65.947915
QR_Y_START = 3.7974267
QR_WIDTH   = 81.007207 - 65.947915
QR_HEIGHT  = 18.553716 - 3.7974267
QR_GROUP_ID = "qr-group"


# ---------- Small helpers ----------
def ns_prefix(root):
    """Return '{namespace}' for SVG or '' if none."""
    tag = root.tag
    if tag.startswith("{"):
        return tag.split("}")[0] + "}"
    return ""


def find_by_id(root, element_id):
    for el in root.iter():
        if el.get("id") == element_id:
            return el
    return None


def remove_by_id(root, element_id):
    pmap = {child: parent for parent in root.iter() for child in parent}
    for el in root.iter():
        if el.get("id") == element_id:
            parent = pmap.get(el)
            if parent is not None:
                parent.remove(el)
                return True
    return False


def remove_many_by_ids(root, ids):
    pmap = {child: parent for parent in root.iter() for child in parent}
    removed = 0
    for el in list(pmap.keys()):
        if el.get("id") in ids:
            pmap[el].remove(el)
            removed += 1
    return removed


def upsert_qr_group(root, ns):
    g = find_by_id(root, QR_GROUP_ID)
    if g is None:
        g = ET.Element(ns + "g", attrib={"id": QR_GROUP_ID})
        root.append(g)
    else:
        for child in list(g):
            g.remove(child)
    return g


def generate_qr_paths(ns, data):
    """Return a list of <path> elements representing the QR code."""
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_L,
                       box_size=1, border=1)
    qr.add_data(data)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    n = len(matrix)
    cell_w = QR_WIDTH / n
    cell_h = QR_HEIGHT / n

    style = "fill:#ffffff;fill-opacity:1;stroke:#ffffff;stroke-width:0.0416983"
    paths = []
    for r in range(n):
        for c in range(n):
            if matrix[r][c]:
                x = QR_X_START + c * cell_w
                y = QR_Y_START + r * cell_h
                d = "M {},{} h {} v {} h -{} z".format(x, y, cell_w, cell_h, cell_w)
                paths.append(ET.Element(ns + "path", attrib={"style": style, "d": d}))
    return paths


def update_svg(svg_text, machine, version, serial, qr_url):
    """Apply text and QR updates and return SVG as a string."""
    root = ET.fromstring(svg_text)
    ns = ns_prefix(root)

    # Set machine, version (with guaranteed leading space), serial
    el = find_by_id(root, ID_MACHINE)
    if el is not None:
        el.text = machine

    el = find_by_id(root, ID_VERSION)
    if el is not None:
        # Ensure exactly one leading space before the version string
        v = version.lstrip()
        el.text = " " + v if v else ""

    el = find_by_id(root, ID_SERIAL)
    if el is not None:
        s = serial.lstrip()
        el.text = " " + s if s else ""

    # Remove "Example" text and legacy QR paths
    remove_by_id(root, ID_EXAMPLE_TEXT)
    remove_many_by_ids(root, LEGACY_QR_IDS)

    # Insert fresh QR into a stable group
    qr_group = upsert_qr_group(root, ns)
    for p in generate_qr_paths(ns, qr_url):
        qr_group.append(p)

    return ET.tostring(root, encoding="unicode")


def list_files(directory, extension):
    """Return a sorted list of files in directory with the given extension."""
    return sorted(directory.glob("*.{}".format(extension)))


def pick_file_interactive(files, label):
    """Interactive selection from a list of Paths. Returns a Path."""
    if not files:
        print("No {} files found.".format(label))
        return None
    print("\n{} files:".format(label))
    print("-" * 50)
    for i, p in enumerate(files, 1):
        print("{}. {}".format(i, p.name))
    while True:
        choice = input("Select {} file (1-{}): ".format(label, len(files))).strip()
        if not choice:
            continue
        try:
            idx = int(choice) - 1
        except ValueError:
            print("Please enter a valid number")
            continue
        if 0 <= idx < len(files):
            sel = files[idx]
            print("Selected:", sel.name)
            return sel
        print("Enter a number between 1 and {}".format(len(files)))


def prompt_output_dir(default_path):
    """Prompt for output dir with default; sanitize a few unfriendly chars."""
    resp = input("\nOutput directory (Enter for '{}'): ".format(default_path)).strip()
    if not resp:
        return default_path
    for ch in '<>:"|?*':
        resp = resp.replace(ch, "_")
    return resp


def _print_progress(i, total, width=40):
    if total <= 0:
        return
    ratio = i / float(total)
    filled = int(ratio * width)
    bar = '#' * filled + '-' * (width - filled)
    print('\r[{}] {}/{}'.format(bar, i, total), end='', flush=True)


def process_csv(csv_path, template_path, outdir, machine, version):
    """Read CSV rows and generate one SVG per row (with progress bar)."""
    outdir.mkdir(parents=True, exist_ok=True)
    tpl = template_path.read_text(encoding="utf-8")

    with csv_path.open("r", encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    total = len(rows)
    count = 0
    for i, row in enumerate(rows, 1):
        serial = (row.get("Machine ID") or "").strip()
        qr_url = (row.get("Machine QR code URL") or "").strip()
        svg = update_svg(tpl, machine, version, serial, qr_url)
        (outdir / "{}.svg".format(serial)).write_text(svg, encoding="utf-8")
        count += 1
        _print_progress(i, total)

    if total:
        print()  # newline after progress bar
    return count


def main():
    ap = argparse.ArgumentParser(description="Generate SVG labels (IDs/tags only; no regex).")
    ap.add_argument("--template", type=Path, help="Template SVG path (fallback: interactive picker)")
    ap.add_argument("--csv",       type=Path, help="CSV path (fallback: interactive picker)")
    ap.add_argument("--outdir",    type=Path, help="Output dir (fallback: interactive prompt)")
    ap.add_argument("--machine",   help="Machine name (fallback: prompt)", default=None)
    ap.add_argument("--version",   help="Version string (fallback: prompt)", default=None)
    args = ap.parse_args()

    # Select template
    tpl = args.template
    if tpl is None:
        if not TPL_DIR.exists():
            print("Templates dir not found:", TPL_DIR)
            sys.exit(1)
        tpl = pick_file_interactive(list_files(TPL_DIR, "svg"), "Template SVG")
        if tpl is None:
            sys.exit(1)

    # Select CSV
    csv_path = args.csv
    if csv_path is None:
        if not IDS_DIR.exists():
            print("IDs dir not found:", IDS_DIR)
            sys.exit(1)
        csv_path = pick_file_interactive(list_files(IDS_DIR, "csv"), "CSV ID")
        if csv_path is None:
            sys.exit(1)

    # Machine / Version (prompt if missing)
    machine = args.machine or (input("Machine name (Enter for '{}'): ".format(DEFAULT_MACHINE)).strip() or DEFAULT_MACHINE)
    version = args.version or (input("Version (Enter for '{}'): ".format(DEFAULT_VERSION)).strip() or DEFAULT_VERSION)

    # Output dir (prompt default to outputs/<csv-stem>-labels)
    outdir = args.outdir
    if outdir is None:
        default_outdir = Path("outputs") / "{}-labels".format(csv_path.stem)
        outdir = Path(prompt_output_dir(str(default_outdir)))

    print("\n--- Summary ---")
    print("Template :", tpl.name)
    print("CSV      :", csv_path.name)
    print("Machine  :", "{} {}".format(machine, version))  # display with space
    print("Out dir  :", outdir)

    n = process_csv(csv_path, tpl, outdir, machine, version)
    print("\nGenerated {} SVGs \u2192 {}".format(n, outdir))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAborted.")
        sys.exit(1)
