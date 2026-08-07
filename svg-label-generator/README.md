# SVG Label Generator

Generate laser-cutter-ready nameplate sheets for VotingWorks hardware.

The tool is a three-stage pipeline fed by a config file. You set the **version and build** for this run in the yaml config, design a nameplate **template** from it, stamp that with a **batch** of serial numbers + QR codes from a CSV, then **tile** those into full sheets sized to your laser cutter's bed.

```
nameplate_config.yaml  →  template-generator.py  →  nameplate-batch-generator.py  →  laser-layout.py
   (set version/build)       (design one)              (stamp many from CSV)            (tile onto the bed)
                             assets/templates/         outputs/<id>-nameplates/         outputs/<id>-laser-cutouts/
```

The output of the last stage is a set of SVGs you send straight to the laser cutter: a green bed outline, blue cutout rectangles for your fixture, and each nameplate laid out inside its slot.

---

## Quick start (from clean checkout to a laser sheet)

```bash
# 1. install python deps
pip install -r requirements.txt

# 2. install fonts (Debian/Ubuntu shown; see "Fonts" below for macOS/Windows)
sudo apt install fonts-roboto ttf-mscorefonts-installer

# 3. set the version + build for THIS run (see "Stage 0" below — do this every time)
cp assets/nameplate_config_template.yaml assets/nameplate_config.yaml   # first time only
$EDITOR assets/nameplate_config.yaml

# 4. design a template  (pick a product from the config, accept defaults)
python3 template-generator.py

# 5. stamp serials + QR codes onto it  (pick the template, pick a CSV)
python3 nameplate-batch-generator.py

# 6. tile them onto your laser bed  (pick the folder, enter bed size)
python3 laser-layout.py
```

Every script is interactive: it lists what it found and asks you to pick a number. There are no command-line flags to memorize.

If you already have a template SVG at the right version in `assets/templates/`, you can skip steps 3–4 and start at step 5.

---

## Stage 0 — Set the version + build for this run (`assets/nameplate_config.yaml`)

**Do this every time you make nameplates.** Layouts and text come from `assets/nameplate_config.yaml`, one entry per product. First time only, copy the tracked template:

```bash
cp assets/nameplate_config_template.yaml assets/nameplate_config.yaml
```

Then edit the fields that change from build to build. For each product, the two you'll almost always touch:

```yaml
products:
  VxScan:
    text:
      product_line:
        value: v4.0.4        # ← hardware/product version for this run
      serial_line:
        value: SC-16-XXX     # ← build/serial placeholder for this run
```

The `serial_line.value` is just a placeholder — Stage 2 replaces it per-row from your CSV — but it's worth setting to the right build (e.g. `SC-16-XXX`) so a template opened on its own reads correctly.

You can also change these at the interactive prompts in Stage 1 instead of editing the file, but edits in the YAML persist for next time; prompt overrides are one-offs (unless you save them back).

## Stage 1 — Design a template (`template-generator.py`)

Produces a single blank nameplate SVG: outline, mounting holes, logo, company name, product/serial/rating text, and a placeholder `square` where the QR code will go later. It reads the config you just set in Stage 0.

```bash
python3 template-generator.py            # interactive product picker
python3 template-generator.py VxScan     # or name a product directly
```

You can select a saved product, tweak any dimension/text field at the prompts, and optionally save your changes back to the config as a new product.

**Output:** `assets/templates/nameplate_<Product>_<version>_<serial>.svg`
(e.g. `nameplate_VxScan_v4.0.4_SC-16-XXX.svg`)

The `nameplate_config.yaml` you edit day-to-day is gitignored — only the committed `*_template.yaml` tracks structure. See "Editing the config" below.

## Stage 2 — Stamp a batch (`nameplate-batch-generator.py`)

Takes one template + a CSV of serials and URLs, and writes one finished SVG per row: the serial line is filled in and the `square` placeholder is replaced with a real QR code (high error-correction, embedded as a PNG to save space in the laser cut SVG file).

```bash
python3 nameplate-batch-generator.py     # pick a template, then pick a CSV
```

**CSV format** — header row required, two columns:

```csv
Machine ID,Machine QR code URL
SC-13-001,https://vxqr.org/sn/SC-13-001#...
SC-13-002,https://vxqr.org/sn/SC-13-002#...
```

Put CSVs in `assets/ids/`. Column 1 is the serial (also becomes the filename); column 2 is the URL encoded in the QR code.

**Output:** `outputs/<prefix>-nameplates/<serial>.svg`, where `<prefix>` is the first 5 characters of the first serial, lowercased (e.g. `SC-13-001` → `outputs/sc-13-nameplates/`).

## Stage 3 — Tile onto the laser bed (`laser-layout.py`)

Takes a `-nameplates` folder and arranges the SVGs into grid sheets sized to your cutter. It reads the nameplate size from the `outline` element, computes how many fit per sheet, centers the grid, and spills onto additional sheets as needed.

```bash
python3 laser-layout.py                  # pick a folder, then enter bed settings
```

You'll be prompted for (defaults in brackets):

| Setting | Default | Notes |
|---|---|---|
| Laser cutter width | 813 mm | bed width |
| Laser cutter height | 508 mm | bed height |
| Laser kerf | 0.1 mm | added to each side of every cutout |
| Margins (all sides) | 10 mm | dead border around the sheet |
| Padding between labels | 10 mm | gap between cutouts |

**Output:** `outputs/<id>-laser-cutouts/<prefix>-grid-<n>of<N>_<w>x<h>_<kerf>_<margin>_<padding>.svg`

Each sheet contains a green bed rectangle (`#00FF00`), blue cutout rectangles (`#0000FF`), and the nameplates centered in their slots. The nameplate outline itself is red (`#FF0000`). Map those colors to your cutter's operations (cut / score / etch) in your laser software.

---

## Requirements

- **Python 3.10+**
- Python packages: see `requirements.txt` (`pip install -r requirements.txt`)
- **Fonts** for Stage 1 (see below). Stages 2 and 3 need no fonts.

### Fonts

`template-generator.py` measures text with real font metrics, so it needs the font files on disk. It looks for **Roboto** (company name) and **Arial** (all other text), and automatically falls back to metric-compatible substitutes (**Arimo**, **Liberation Sans**) if Arial isn't installed — so you don't strictly need Microsoft's fonts.

**Debian / Ubuntu:**
```bash
sudo apt install fonts-roboto fonts-croscore fonts-liberation
# optional, for genuine Arial (needs contrib/multiverse enabled):
sudo apt install ttf-mscorefonts-installer
```

**macOS:** Roboto via `brew install --cask font-roboto`; Arial ships with the OS.

**Windows:** Arial ships with the OS; install Roboto from Google Fonts.

If a font can't be found, the script prints a warning and falls back to width estimation — the SVG still generates but text spacing will be approximate. Verify what's installed with `fc-list | grep -iE 'roboto|arial|arimo|liberation'`.

---

## Directory structure

```
svg-label-generator/
├── template-generator.py            # Stage 1: design a template
├── nameplate-batch-generator.py     # Stage 2: stamp serials + QR codes
├── laser-layout.py                  # Stage 3: tile onto the laser bed
├── requirements.txt
├── README.md
├── assets/
│   ├── nameplate_config_template.yaml   # tracked: structure reference
│   ├── nameplate_config.yaml            # gitignored: your live products (copy from template)
│   ├── ids/                             # your CSVs go here
│   │   └── example-ids.csv
│   └── templates/                       # Stage 1 output (gitignored)
├── outputs/                             # Stages 2 & 3 output (gitignored)
│   ├── <id>-nameplates/
│   └── <id>-laser-cutouts/
└── archived/                            # previous single-script workflow (unused)
```

## Config & version control

Day-to-day version/build edits happen in `assets/nameplate_config.yaml` (Stage 0). That file is **gitignored**, so routine value changes don't clutter history. Only the tracked `assets/nameplate_config_template.yaml` is committed.

When you change the config's **structure** — add a product, add or rename a field — mirror that change into the tracked `assets/nameplate_config_template.yaml` so the schema stays in version control. Value changes stay local; structure changes get committed.

## Template SVG contract

If you hand-edit a template or build one in another tool, the downstream scripts rely on these element IDs:

- `outline` — the nameplate boundary; its `width`/`height` drive the laser grid math.
- `square` — placeholder swapped for the QR code in Stage 2.
- `serial-line` — text element whose value is replaced per serial in Stage 2.

Templates from `template-generator.py` already include all three.