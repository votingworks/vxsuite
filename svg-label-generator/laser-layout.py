#!/usr/bin/env python3
"""
generate_laser_grids.py - Layout nameplates into laser cutter grids

Requires: no additional packages beyond standard library
"""

import os
import xml.etree.ElementTree as ET
import math

# Register SVG namespace
ET.register_namespace('', 'http://www.w3.org/2000/svg')

NAMESPACE = 'http://www.w3.org/2000/svg'
NS = {'svg': NAMESPACE}

def find_nameplate_folders():
    """Find all folders in outputs that end with '-nameplates'."""
    outputs_dir = os.path.join('.', 'outputs')
    if not os.path.exists(outputs_dir):
        return []
    
    folders = []
    for item in os.listdir(outputs_dir):
        item_path = os.path.join(outputs_dir, item)
        if os.path.isdir(item_path) and item.endswith('-nameplates'):
            folders.append(item_path)
    
    return sorted(folders)

def select_folder(folders):
    """Let user select a folder from list."""
    if not folders:
        print("No nameplate folders found.")
        return None
    
    print("\n=== Available Nameplate Folders ===")
    for i, folder in enumerate(folders, 1):
        folder_name = os.path.basename(folder)
        svg_count = len([f for f in os.listdir(folder) if f.endswith('.svg')])
        print(f"  {i}. {folder_name} ({svg_count} files)")
    
    while True:
        try:
            choice = input(f"\nSelect folder [1-{len(folders)}]: ").strip()
            choice_idx = int(choice) - 1
            
            if 0 <= choice_idx < len(folders):
                return folders[choice_idx]
            else:
                print("Invalid selection. Please try again.")
        except ValueError:
            print("Please enter a number.")

def prompt_float(prompt, default):
    """Prompt user for a floating-point value."""
    while True:
        raw = input(f"{prompt} [{default}mm]: ").strip()
        if not raw:
            return default
        try:
            return float(raw)
        except ValueError:
            print("Please enter a numeric value.")

def get_laser_settings():
    """Prompt user for laser cutter settings."""
    print("\n=== Laser Cutter Settings ===")
    settings = {
        'width': prompt_float("Laser cutter width", 813),
        'height': prompt_float("Laser cutter height", 508),
        'kerf': prompt_float("Laser kerf", 0.1),
        'margin': prompt_float("Margins (all sides)", 10),
        'padding': prompt_float("Padding between labels", 10)
    }
    return settings

def get_outline_dimensions(svg_path):
    """Extract dimensions from outline element of SVG."""
    tree = ET.parse(svg_path)
    root = tree.getroot()
    
    # Find outline element
    outline = None
    for elem in root.iter():
        if elem.get('id') == 'outline':
            outline = elem
            break
    
    if outline is None:
        raise ValueError("Could not find 'outline' element in SVG")
    
    width = float(outline.get('width', 0))
    height = float(outline.get('height', 0))
    rx = float(outline.get('rx', 0))
    ry = float(outline.get('ry', 0))
    
    return width, height, rx, ry

def calculate_grid_layout(laser_width, laser_height, cutout_width, cutout_height, 
                          margin, padding):
    """Calculate how many cutouts fit in grid and their positions."""
    # Available space after margins
    available_width = laser_width - (2 * margin)
    available_height = laser_height - (2 * margin)
    
    # Calculate columns and rows
    # Each cutout takes up: cutout_width + padding (except last one doesn't need trailing padding)
    cols = int((available_width + padding) / (cutout_width + padding))
    rows = int((available_height + padding) / (cutout_height + padding))
    
    if cols < 1 or rows < 1:
        raise ValueError("Cutout dimensions too large for laser bed with given margins")
    
    # Calculate actual spacing to center the grid
    total_width = cols * cutout_width + (cols - 1) * padding
    total_height = rows * cutout_height + (rows - 1) * padding
    
    start_x = margin + (available_width - total_width) / 2
    start_y = margin + (available_height - total_height) / 2
    
    # Generate positions
    positions = []
    for row in range(rows):
        for col in range(cols):
            x = start_x + col * (cutout_width + padding)
            y = start_y + row * (cutout_height + padding)
            positions.append((x, y))
    
    return positions, cols, rows

def create_grid_svg(laser_width, laser_height, cutout_width, cutout_height, 
                   positions, grid_num):
    """Create a new grid SVG with laserbed and cutout rectangles."""
    # Create root SVG element
    root = ET.Element('svg', {
        # Remove 'xmlns': NAMESPACE,  <-- DELETE THIS LINE
        'width': f'{laser_width}mm',
        'height': f'{laser_height}mm',
        'viewBox': f'0 0 {laser_width} {laser_height}'
    })
    
    # Rest of function remains the same...
    
    # Add laserbed rectangle (green, 0.1mm stroke)
    laserbed = ET.SubElement(root, 'rect', {
        'id': 'laserbed',
        'x': '0',
        'y': '0',
        'width': str(laser_width),
        'height': str(laser_height),
        'fill': 'none',
        'stroke': '#00FF00',
        'stroke-width': '0.1'
    })
    
    # Add cutout rectangles (blue, 0.1mm stroke)
    for i, (x, y) in enumerate(positions):
        cutout = ET.SubElement(root, 'rect', {
            'id': f'cutout-{i+1}',
            'x': str(x),
            'y': str(y),
            'width': str(cutout_width),
            'height': str(cutout_height),
            'fill': 'none',
            'stroke': '#0000FF',
            'stroke-width': '0.1'
        })
    
    return ET.ElementTree(root)

def make_ids_unique(elem, nameplate_index, parent_map=None):
    """Recursively make IDs unique by appending nameplate index."""
    if 'id' in elem.attrib:
        original_id = elem.get('id')
        elem.set('id', f"{original_id}-{nameplate_index}")
    
    for child in elem:
        make_ids_unique(child, nameplate_index, parent_map)

def embed_nameplate_in_cutout(grid_root, nameplate_path, cutout_x, cutout_y, 
                              cutout_width, cutout_height, nameplate_width, 
                              nameplate_height, index):
    """Embed a nameplate SVG centered in a cutout."""
    # Parse nameplate
    nameplate_tree = ET.parse(nameplate_path)
    nameplate_root = nameplate_tree.getroot()
    
    # Calculate centering offset
    offset_x = cutout_x + (cutout_width - nameplate_width) / 2
    offset_y = cutout_y + (cutout_height - nameplate_height) / 2
    
    # Create a group for this nameplate
    group = ET.SubElement(grid_root, 'g', {
        'id': f'nameplate-{index}',
        'transform': f'translate({offset_x}, {offset_y})'
    })
    
    # Copy all children from nameplate root to group
    for child in nameplate_root:
        # Deep copy the element
        child_copy = ET.fromstring(ET.tostring(child))
        # Make IDs unique to avoid conflicts
        make_ids_unique(child_copy, index)
        group.append(child_copy)
    
    return True

def get_svg_files(folder):
    """Get all SVG files in folder."""
    files = []
    for file in os.listdir(folder):
        if file.endswith('.svg'):
            files.append(os.path.join(folder, file))
    return sorted(files)

def process_nameplates(nameplate_folder, laser_settings, outline_dims):
    """Process all nameplates and create grid files."""
    nameplate_width, nameplate_height, rx, ry = outline_dims
    
    # Calculate cutout dimensions (nameplate + kerf on all sides)
    kerf = laser_settings['kerf']
    cutout_width = nameplate_width + (2 * kerf)
    cutout_height = nameplate_height + (2 * kerf)
    
    # Calculate grid layout
    positions, cols, rows = calculate_grid_layout(
        laser_settings['width'],
        laser_settings['height'],
        cutout_width,
        cutout_height,
        laser_settings['margin'],
        laser_settings['padding']
    )
    
    slots_per_grid = len(positions)
    print(f"\nGrid layout: {cols} columns × {rows} rows = {slots_per_grid} slots per grid")
    
    # Get all nameplate files
    svg_files = get_svg_files(nameplate_folder)
    total_nameplates = len(svg_files)
    
    if total_nameplates == 0:
        print("No SVG files found in folder.")
        return
    
    # Calculate number of grids needed
    num_grids = math.ceil(total_nameplates / slots_per_grid)
    print(f"Total nameplates: {total_nameplates}")
    print(f"Grids needed: {num_grids}")
    
    # Create output directory and file prefix
    folder_name = os.path.basename(nameplate_folder)
    prefix = folder_name[:5].lower()  # First 5 chars, lowercase
    output_folder_name = folder_name.replace('-nameplates', '')
    output_dir = os.path.join('.', 'outputs', f"{output_folder_name}-laser-cutouts")
    os.makedirs(output_dir, exist_ok=True)
    
    # Process grids
    nameplate_index = 0
    for grid_num in range(1, num_grids + 1):
        print(f"\nProcessing grid {grid_num}/{num_grids}...")
        
        # Create grid SVG
        grid_tree = create_grid_svg(
            laser_settings['width'],
            laser_settings['height'],
            cutout_width,
            cutout_height,
            positions,
            grid_num
        )
        grid_root = grid_tree.getroot()
        
        # Fill slots with nameplates
        slots_filled = 0
        for slot_idx, (cutout_x, cutout_y) in enumerate(positions):
            if nameplate_index >= total_nameplates:
                break
            
            nameplate_path = svg_files[nameplate_index]
            nameplate_name = os.path.basename(nameplate_path)
            
            print(f"  [{slot_idx + 1}/{slots_per_grid}] Adding: {nameplate_name}")
            
            embed_nameplate_in_cutout(
                grid_root,
                nameplate_path,
                cutout_x,
                cutout_y,
                cutout_width,
                cutout_height,
                nameplate_width,
                nameplate_height,
                nameplate_index + 1
            )
            
            nameplate_index += 1
            slots_filled += 1
        
        # Save grid with prefix
        output_path = os.path.join(output_dir, f"{prefix}-grid-{grid_num}.svg")
        grid_tree.write(output_path, encoding='utf-8', xml_declaration=True)
        print(f"  Saved: {output_path} ({slots_filled} nameplates)")
    
    print(f"\n{'='*50}")
    print(f"Complete! Generated {num_grids} grid file(s)")
    print(f"Output location: {output_dir}")

def main():
    """Main entry point."""
    print("=== Laser Grid Layout Generator ===")
    
    # Find nameplate folders
    folders = find_nameplate_folders()
    
    if not folders:
        print("\nNo nameplate folders found in ./outputs/")
        print("Exiting.")
        return
    
    # Select folder
    folder = select_folder(folders)
    if folder is None:
        return
    
    print(f"\nSelected: {os.path.basename(folder)}")
    
    # Get laser settings
    laser_settings = get_laser_settings()
    
    # Get outline dimensions from first SVG
    print("\nExtracting nameplate dimensions...")
    svg_files = get_svg_files(folder)
    if not svg_files:
        print("No SVG files found in folder.")
        return
    
    try:
        outline_dims = get_outline_dimensions(svg_files[0])
        width, height, rx, ry = outline_dims
        print(f"Nameplate dimensions: {width}mm × {height}mm (corner radius: {rx}mm)")
    except Exception as e:
        print(f"Error reading SVG dimensions: {e}")
        return
    
    # Process nameplates
    try:
        process_nameplates(folder, laser_settings, outline_dims)
    except Exception as e:
        print(f"\nError during processing: {e}")
        return

if __name__ == "__main__":
    main()