#!/usr/bin/env python3
"""
generate_nameplates_from_csv.py - Batch generate nameplates from CSV data

Requires: pip install qrcode[pil] pillow
"""

import os
import csv
import base64
import io
import xml.etree.ElementTree as ET
import qrcode
from PIL import Image

# Register SVG namespace
ET.register_namespace('', 'http://www.w3.org/2000/svg')

NAMESPACE = 'http://www.w3.org/2000/svg'
NS = {'svg': NAMESPACE}

def find_files(directory, extension):
    """Find all files with given extension in directory."""
    if not os.path.exists(directory):
        return []
    
    files = []
    for file in os.listdir(directory):
        if file.endswith(extension):
            files.append(os.path.join(directory, file))
    return sorted(files)

def select_file(files, file_type):
    """Let user select a file from list."""
    if not files:
        print(f"No {file_type} files found.")
        return None
    
    print(f"\n=== Available {file_type} Files ===")
    for i, file in enumerate(files, 1):
        print(f"  {i}. {os.path.basename(file)}")
    
    while True:
        try:
            choice = input(f"\nSelect {file_type} [1-{len(files)}]: ").strip()
            choice_idx = int(choice) - 1
            
            if 0 <= choice_idx < len(files):
                return files[choice_idx]
            else:
                print("Invalid selection. Please try again.")
        except ValueError:
            print("Please enter a number.")

def read_csv_data(csv_path):
    """Read CSV file and return data rows (skip header)."""
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # Skip header
        return list(reader)

def find_element_by_id(root, element_id):
    """Find an element by its id attribute."""
    for elem in root.iter():
        if elem.get('id') == element_id:
            return elem
    return None

def get_square_dimensions(square_elem):
    """Get dimensions and position of square element."""
    x = float(square_elem.get('x', 0))
    y = float(square_elem.get('y', 0))
    width = float(square_elem.get('width', 0))
    height = float(square_elem.get('height', 0))
    return x, y, width, height

def generate_qr_code_png(url, size_mm, dpi=1000):
    """Generate QR code as PNG image.
    
    Args:
        url: URL to encode
        size_mm: Size in millimeters
        dpi: DPI for conversion (1000 for high quality)
    
    Returns:
        PIL Image object
    """
    # Convert mm to pixels at given DPI
    # 1 inch = 25.4 mm
    size_px = int((size_mm / 25.4) * dpi)
    
    # Generate QR code
    qr = qrcode.QRCode(
        version=None,  # Auto-determine version
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # High error correction
        box_size=10,
        border=1,  # Minimal border
    )
    qr.add_data(url)
    qr.make(fit=True)
    
    # Create image
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Resize to exact pixel dimensions
    img = img.resize((size_px, size_px), Image.Resampling.LANCZOS)
    
    return img

def png_to_base64(img):
    """Convert PIL Image to base64 string."""
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode('utf-8')

def update_serial_line(root, serial_value):
    """Update the serial-line text element with new serial value."""
    serial_elem = find_element_by_id(root, 'serial-line')
    if serial_elem is None:
        print("Warning: Could not find 'serial-line' element")
        return
    
    # The structure is: <text><tspan>Label</tspan> Value</text>
    # or: <text><tspan>Label</tspan><tspan>Value</tspan></text>
    # We need to replace the value part
    
    # Find all tspan elements
    tspans = list(serial_elem.findall(f'{{{NAMESPACE}}}tspan'))
    
    if len(tspans) == 0:
        # No tspans, just replace text
        serial_elem.text = serial_value
    elif len(tspans) == 1:
        # One tspan (the label), value comes after as tail or separate text
        # Set the tail of the first tspan to be space + new value
        tspans[0].tail = f' {serial_value}'
    else:
        # Multiple tspans - replace the last one (the value)
        tspans[-1].text = serial_value

def replace_square_with_qr(root, qr_img, x, y, width, height):
    """Replace square element with QR code PNG image."""
    # Remove the square element
    square_elem = find_element_by_id(root, 'square')
    if square_elem is not None:
        # Find parent and remove
        for parent in root.iter():
            if square_elem in list(parent):
                parent.remove(square_elem)
                break
    
    # Convert QR code to base64
    png_base64 = png_to_base64(qr_img)
    
    # Create image element with namespace
    image_elem = ET.Element(f'{{{NAMESPACE}}}image', {
        'id': 'qr-code',
        'x': str(x),
        'y': str(y),
        'width': str(width),
        'height': str(height),
        f'{{{NAMESPACE}}}href': f"data:image/png;base64,{png_base64}"
    })
    
    # Add to SVG root
    root.append(image_elem)

def process_template(template_path, serial, url, output_dir):
    """Process one template with given serial and URL."""
    # Parse SVG
    tree = ET.parse(template_path)
    root = tree.getroot()
    
    # Update serial line
    update_serial_line(root, serial)
    
    # Get square dimensions
    square_elem = find_element_by_id(root, 'square')
    if square_elem is None:
        print(f"Warning: Could not find 'square' element for {serial}")
        return False
    
    x, y, width, height = get_square_dimensions(square_elem)
    
    # Generate QR code
    qr_img = generate_qr_code_png(url, width)
    
    # Replace square with QR code
    replace_square_with_qr(root, qr_img, x, y, width, height)
    
    # Save output
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{serial}.svg")
    
    tree.write(output_path, encoding='utf-8', xml_declaration=True)
    return True

def get_output_directory(serial):
    """Get output directory based on first 5 characters of serial."""
    prefix = serial[:5].lower()
    return os.path.join('.', 'outputs', f"{prefix}-nameplates")

def main():
    """Main entry point."""
    print("=== Nameplate Batch Generator ===")
    
    # Find template SVGs
    templates_dir = os.path.join('.', 'assets', 'templates')
    template_files = find_files(templates_dir, '.svg')
    
    if not template_files:
        print(f"\nNo SVG templates found in {templates_dir}")
        print("Exiting.")
        return
    
    # Select template
    template_path = select_file(template_files, "SVG Template")
    if template_path is None:
        return
    
    print(f"Selected: {os.path.basename(template_path)}")
    
    # Find CSV files
    ids_dir = os.path.join('.', 'assets', 'ids')
    csv_files = find_files(ids_dir, '.csv')
    
    if not csv_files:
        print(f"\nNo CSV files found in {ids_dir}")
        print("Exiting.")
        return
    
    # Select CSV
    csv_path = select_file(csv_files, "CSV")
    if csv_path is None:
        return
    
    print(f"Selected: {os.path.basename(csv_path)}")
    
    # Read CSV data
    print(f"\nReading CSV data...")
    try:
        data_rows = read_csv_data(csv_path)
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return
    
    print(f"Found {len(data_rows)} data rows")
    
    if not data_rows:
        print("No data rows found in CSV. Exiting.")
        return
    
    # Determine output directory from first serial
    first_serial = data_rows[0][0].strip() if data_rows and len(data_rows[0]) > 0 else 'default'
    output_dir = get_output_directory(first_serial)
    
    print(f"\nGenerating nameplates...")
    print(f"Output directory: {output_dir}\n")
    
    # Process each row
    success_count = 0
    for i, row in enumerate(data_rows, 1):
        if len(row) < 2:
            print(f"[{i}/{len(data_rows)}] Warning: Row has fewer than 2 columns, skipping")
            continue
        
        serial = row[0].strip()
        url = row[1].strip()
        
        if not serial or not url:
            print(f"[{i}/{len(data_rows)}] Warning: Empty serial or URL, skipping")
            continue
        
        print(f"[{i}/{len(data_rows)}] Processing: {serial}")
        if process_template(template_path, serial, url, output_dir):
            success_count += 1
    
    print(f"\n{'='*50}")
    print(f"Complete! Generated {success_count}/{len(data_rows)} nameplates")
    print(f"Output location: {output_dir}")

if __name__ == "__main__":
    main()