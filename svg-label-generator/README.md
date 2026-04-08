# SVG Label Generator

A Python tool that generates individual SVG labels with dynamic serial numbers and QR codes from CSV data.
A secondary script lays out an array of sequential labels for use in a user defined laser cutter

## Features

### Label Generator

- Reads CSV files containing machine IDs and QR code URLs
- Generates individual SVG labels for each entry
- Dynamically replaces serial numbers, machine names, versions, and QR codes use svg tags
- Interactive file selection from organized directory structure
- Customizable output directory naming

### Laser Layout
- Interactive file selection looks for generated labels
- allows user to input laser cutter dimensions, label padding, and offsets
- calculates the number of layouts needed for a given laser cutter profile and number of labels
- inverts colors for etching

## Requirements

- Python 3.6+
- qrcode library
- Standard library modules (csv, os, sys, xml.etree, re, io, base64, glob)

## Installation

1. Clone this repository:
```bash
git clone [repository-url]
cd svg-label-generator
```

2. Install required dependencies:
```bash
pip install -r requirements.txt
```

3. Set up the directory structure:
```bash
mkdir -p assets/ids assets/templates
```

## Directory Structure

```
svg-label-generator/
├── svg_label_generator.py   # Main script
├── requirements.txt         # Python dependencies
├── README.md                # This file
├── assets/
│   ├── ids/                 # Place CSV files here
│   └── templates/           # Place SVG template files here
├── outputs/
│   ├── ids/                 # Place CSV files here
│   └── layouts/             # Place SVG template files here
```

## Usage

### 1. Prepare Your Files

**CSV File Format:**
Your CSV file should contain the following columns:
- `Machine ID`: Unique identifier for each machine (e.g., "SC-01-001")
- `Machine QR code URL`: URL to be encoded in the QR code

Example CSV content:
```csv
Machine ID,Machine QR code URL
SC-01-001,https://example.com/machine/SC-01-001
SC-01-002,https://example.com/machine/SC-01-002
```

**SVG Template:**
- Place your SVG template file in `assets/templates/`
- Template should contain placeholder elements for:
  - Serial number (in element with id="tspan7")
  - Machine name (replace "VxScan")
  - Version (replace "v4.0.2")
  - QR code area (paths with ids "path13" through "path37")

### 2. Run the Script

```bash
python svg_label_generator.py
```

The script will:
1. Display available template SVG files
2. Display available CSV files
3. Prompt for machine name and version
4. Prompt for output directory name
5. Generate individual SVG files for each CSV entry

### 3. Interactive Prompts

- **Template Selection**: Choose from available SVG templates in `assets/templates/`
- **CSV Selection**: Choose from available CSV files in `assets/ids/`
- **Machine Name**: Enter the machine name (default: "VxScan")
- **Version**: Enter the version string (default: "v4.0.2")
- **Output Directory**: Specify where to save generated files (default: "generated_labels")

## Output

The script generates:
- Individual SVG files named after each Machine ID
- Files saved in the specified output directory
- Each SVG contains the unique serial number and corresponding QR code

## Error Handling

- Validates directory existence before execution
- Handles file selection errors gracefully
- Provides warnings for replacement failures
- Sanitizes input data to remove control characters

### v1.0.0
- Initial release
- Basic SVG label generation with QR codes
- Interactive file selection
- Machine name and version customization
