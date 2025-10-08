#!/usr/bin/env python3
"""
generate_nameplate_svg.py — Using fontTools for accurate text measurements
- Units: mm (fixed)
- Outer rectangle: white fill, red stroke #FF0000 @ 0.1 mm (always on)
- Corners: rx == ry (single radius prompt)
- Holes (2): centered vertically, symmetric about center
- Three textboxes with accurate font-based measurements
- Logo and square in top section
- Configuration file support for products
- Textbox3 side padding is a global percentage (5% per side), not prompted

Requires: pip install fonttools pyyaml
"""

import os
import yaml
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

# ============================================================================
# CONSTANTS - Modify these to adjust layout
# ============================================================================

# Colors and strokes
RED = "#FF0000"
BLACK = "#000000"
WHITE = "#FFFFFF"
STROKE_WIDTH = 0.1  # mm

# Textbox3 (bottom section) side padding as ratio of overall width (per side)
TEXTBOX3_SIDE_PADDING_RATIO = 0.10  # 5% per side

# Logo positioning and padding (as percentage of available space)
LOGO_PADDING_TOP_BOTTOM = 0.15  # 15% padding above and below logo
LOGO_PADDING_LEFT = 0.10        # 5% padding from left edge

# Square positioning and padding
SQUARE_PADDING_TOP_BOTTOM = 0.10  # 10% padding above and below square
SQUARE_PADDING_RIGHT = 0.10       # 5% padding from right edge

# Textbox2 (middle section) constraints
TEXTBOX2_MAX_WIDTH_RATIO = 0.9  # 90% of hole center distance

# Font sizing constraints
MIN_FONT_SIZE = 0.5
MAX_FONT_SIZE = 20.0
TEXTBOX1_MAX_FONT_SIZE = 50.0
TEXTBOX1_LOGO_HEIGHT_PADDING = 0.10  # 1% padding for font height constraint

# Line height multiplier
LINE_HEIGHT_MULTIPLIER = 1.3

# Binary search iterations for font sizing
FONT_SIZE_SEARCH_ITERATIONS = 20

# Font paths - adjust these to your system
FONT_PATHS = {
    'roboto': '/System/Library/Fonts/Supplemental/Arial.ttf',  # fallback to Arial if Roboto not found
    'arial': '/System/Library/Fonts/Supplemental/Arial.ttf',
    'arial-bold': '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
}

# Logo SVG path data
LOGO_PATH_DATA = (
    "m 13.871312,26.46 c -0.19,0 -0.39,-0.03 -0.57,-0.11 -0.76,-0.29 -1.11,-1.07 "
    "-0.79,-1.75 l 10.24,-21.92 h -3.11 L 8.9113117,25.64 c -0.23,0.49 -0.77,0.82 "
    "-1.37,0.82 -0.6,0 -1.13,-0.32 -1.37,-0.82 L 0.12131174,12.67 c -0.2,-0.41 "
    "-0.15,-0.88 0.13,-1.26 0.27,-0.37 0.74,-0.59 1.22999996,-0.59 h 5.92 c 0.82,0 "
    "1.48,0.6 1.48,1.34 0,0.74 -0.66,1.34 -1.48,1.34 h -3.68 l 3.82,8.18 9.7400003,-20.85 "
    "c 0.23,-0.49 0.77,-0.82 1.37,-0.82 h 6.33 c 0.5,0 0.96,0.23 1.23,0.6 0.27,0.37 "
    "0.32,0.84 0.13,1.26 l -11.11,23.77 c -0.24,0.51 -0.79,0.82 -1.37,0.82 z m -0.87,-21.65 "
    "c 0,-2.65 -2.09,-4.81 -4.6600003,-4.81 -2.56,0 -4.66,2.16 -4.66,4.81 0,2.65 2.09,4.81 "
    "4.66,4.81 2.5700003,0 4.6600003,-2.16 4.6600003,-4.81 z m -2.96,0 c 0,1.16 -0.7800003,2.14 "
    "-1.6900003,2.14 -0.92,0 -1.69,-0.98 -1.69,-2.14 0,-1.16 0.78,-2.14 1.69,-2.14 0.92,0 "
    "1.6900003,0.98 1.6900003,2.14 z"
)

# Original logo dimensions
LOGO_ORIGINAL_WIDTH = 26.46
LOGO_ORIGINAL_HEIGHT = 26.46

# Configuration file path
CONFIG_FILE = os.path.join(".", "assets", "nameplate_config.yaml")

# Default configuration values
DEFAULT_CONFIG = {
    'dimensions': {
        'width': 85,
        'height': 50,
        'corner_radius': 2.54,
        'hole_diameter': 4,
        'hole_center_distance': 70
    },
    'layout': {
        'textbox1_overlap_with_logo': -0.01,  # Negative means overlap
        'textbox1_padding_from_square': 0.02
    },
    'text': {
        'company_name': 'VotingWorks',
        'product_line': {
            'label': 'VxScan',
            'value': 'v4.0.3',
            'label_bold': True,
            'value_bold': False
        },
        'serial_line': {
            'label': 'Serial No.',
            'value': 'SC-XX-000',
            'label_bold': True,
            'value_bold': False
        },
        'rating_line': {
            'label': 'Rating:',
            'value': 'AC 110-120V~ , 60Hz, 6.5A MAX',
            'label_bold': True,
            'value_bold': False
        },
        'warning_text': 'Review all user manuals and receive training on this device before operation.'
    }
}

# ============================================================================
# YAML UTILITIES
# ============================================================================

def escape_yaml_string(text):
    """Escape special characters in strings for YAML compatibility."""
    if not text:
        return text
    
    # Check if string needs quoting (contains special YAML chars)
    special_chars = [':', '#', '{', '}', '[', ']', ',', '&', '*', '!', '|', '>', 
                     '@', '`', '"', "'", '%', '\\', '\n', '\r', '\t']
    
    needs_quoting = any(special in text for special in special_chars)  # Changed 'char' to 'special'
    starts_with_special = text and text[0] in ['-', '?', ' ']
    
    if needs_quoting or starts_with_special:
        # Escape existing quotes and wrap in quotes
        escaped = text.replace('"', '\\"')
        return f'"{escaped}"'
    
    return text

# ============================================================================
# CONFIGURATION HANDLING
# ============================================================================

def load_config_file():
    """Load the configuration file if it exists."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                config = yaml.safe_load(f)
                return config.get('products', {})
        except Exception as e:
            print(f"Warning: Could not load config file: {e}")
    return {}


def save_config_file(products_config):
    """Save the configuration file."""
    # Ensure assets directory exists
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    
    # Escape all text values before saving
    escaped_products = {}
    for product_name, config in products_config.items():
        import copy
        escaped_config = copy.deepcopy(config)
        
        # Escape text fields
        if 'text' in escaped_config:
            for key, value in escaped_config['text'].items():
                if isinstance(value, str):
                    escaped_config['text'][key] = escape_yaml_string(value)
                elif isinstance(value, dict):
                    for subkey, subvalue in value.items():
                        if isinstance(subvalue, str):
                            escaped_config['text'][key][subkey] = escape_yaml_string(subvalue)
        
        escaped_products[product_name] = escaped_config
    
    try:
        with open(CONFIG_FILE, 'w') as f:
            yaml.dump({'products': escaped_products}, f, default_flow_style=False, sort_keys=False)
        return True
    except Exception as e:
        print(f"Error saving config file: {e}")
        return False


def select_product_from_config(products):
    """Let user select a product from available configurations."""
    if not products:
        return None, False
    
    print("\n=== Available Product Configurations ===")
    product_list = list(products.keys())
    for i, product in enumerate(product_list, 1):
        print(f"  {i}. {product}")
    print(f"  {len(product_list) + 1}. Enter custom configuration")
    
    while True:
        try:
            choice = input(f"\nSelect option [1-{len(product_list) + 1}]: ").strip()
            choice_idx = int(choice) - 1
            
            if 0 <= choice_idx < len(product_list):
                selected_product = product_list[choice_idx]
                print(f"\nUsing configuration for: {selected_product}")
                
                # Ask if user wants to modify or use as-is
                modify = input("Modify this configuration? [y/N]: ").strip().lower()
                return products[selected_product], modify == 'y'
            elif choice_idx == len(product_list):
                return None, True
            else:
                print("Invalid selection. Please try again.")
        except ValueError:
            print("Please enter a number.")


def prompt_for_save(config, products):
    """Prompt user to save configuration."""
    save = input("\nSave this configuration? [y/N]: ").strip().lower()
    if save != 'y':
        return
    
    # Get product name for saving
    default_name = config['text'].get('product_line', {}).get('label', 'Custom')
    product_name = input(f"Product name to save as [{default_name}]: ").strip()
    if not product_name:
        product_name = default_name
    
    # Check if overwriting
    if product_name in products:
        overwrite = input(f"'{product_name}' already exists. Overwrite? [y/N]: ").strip().lower()
        if overwrite != 'y':
            return
    
    # Save configuration
    products[product_name] = config
    if save_config_file(products):
        print(f"Configuration saved as '{product_name}'")
    else:
        print("Failed to save configuration")

# ============================================================================
# FONT HANDLING
# ============================================================================

def load_font(font_path):
    """Load a font file."""
    try:
        return TTFont(font_path)
    except:
        return None


def get_text_width_mm(text, font, font_size_mm, is_bold=False):
    """
    Calculate actual text width in mm using font metrics.
    
    Args:
        text: String to measure
        font: TTFont object or None
        font_size_mm: Font size in millimeters
        is_bold: Whether the text is bold
        
    Returns:
        Width of text in millimeters
    """
    if font is None:
        # Fallback to estimation if font can't be loaded
        avg_char_width = font_size_mm * (0.57 if is_bold else 0.52)
        return len(text) * avg_char_width
    
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    units_per_em = font['head'].unitsPerEm
    
    total_bounds_width = 0
    
    for char in text:
        if ord(char) in cmap:
            glyph_name = cmap[ord(char)]
            if glyph_name in glyph_set:
                glyph = glyph_set[glyph_name]
                
                # Use advance width as baseline
                advance_width = glyph.width
                
                # Get bounding box for actual rendered size
                pen = BoundsPen(glyph_set)
                glyph.draw(pen)
                
                if pen.bounds:
                    xMin, yMin, xMax, yMax = pen.bounds
                    bounds_width = xMax - xMin
                    total_bounds_width += max(advance_width, bounds_width)
                else:
                    total_bounds_width += advance_width
    
    # Convert from font units to mm
    width_mm = (total_bounds_width / units_per_em) * font_size_mm
    return width_mm

# ============================================================================
# TEXT WRAPPING
# ============================================================================

def wrap_text_to_width(text, max_width_mm, font, font_size_mm, is_bold=False):
    """
    Wrap text to fit within max_width_mm.
    
    Args:
        text: Text to wrap
        max_width_mm: Maximum width in millimeters
        font: TTFont object
        font_size_mm: Font size in millimeters
        is_bold: Whether the text is bold
        
    Returns:
        List of wrapped lines
    """
    words = text.split()
    lines = []
    current_line = []
    
    for word in words:
        test_line = ' '.join(current_line + [word])
        test_width = get_text_width_mm(test_line, font, font_size_mm, is_bold)
        
        if test_width <= max_width_mm:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = [word]
    
    if current_line:
        lines.append(' '.join(current_line))
    
    return lines

# ============================================================================
# FONT SIZE CALCULATION
# ============================================================================

def calculate_max_font_size(text_lines_fn, max_width, max_height=None, 
                           max_font_size=MAX_FONT_SIZE, min_font_size=MIN_FONT_SIZE):
    """
    Binary search to find maximum font size that satisfies constraints.
    
    Args:
        text_lines_fn: Function that takes font_size and returns (lines, max_line_width, total_height)
        max_width: Maximum width constraint
        max_height: Optional maximum height constraint
        max_font_size: Upper bound for search
        min_font_size: Lower bound for search
    
    Returns:
        Maximum font size that fits constraints
    """
    font_size = min_font_size
    
    for _ in range(FONT_SIZE_SEARCH_ITERATIONS):
        test_font_size = (min_font_size + max_font_size) / 2.0
        lines, line_width, total_height = text_lines_fn(test_font_size)
        
        width_fits = line_width <= max_width
        height_fits = max_height is None or total_height <= max_height
        
        if width_fits and height_fits:
            font_size = test_font_size
            min_font_size = test_font_size
        else:
            max_font_size = test_font_size
    
    return font_size

# ============================================================================
# SVG ELEMENT CREATION
# ============================================================================

def create_svg_element(tag, **attrs):
    """Create an SVG element with attributes."""
    attr_str = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'  <{tag} {attr_str}/>'


def create_text_element(x, y, text, font_family, font_size, text_anchor="start", **attrs):
    """Create an SVG text element."""
    attr_str = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'  <text x="{x}" y="{y}" font-family="{font_family}" font-size="{font_size}" fill="black" text-anchor="{text_anchor}" {attr_str}>{text}</text>'

# ============================================================================
# LAYOUT COMPONENTS
# ============================================================================

def add_outline_and_holes(svg_parts, w, h, r, hd, cdist):
    """Add the outline rectangle and mounting holes to the SVG."""
    # Outline rectangle
    svg_parts.append(create_svg_element('rect', id="outline", x=0, y=0, width=w, height=h, 
                                       rx=r, ry=r, fill="none", stroke=RED, 
                                       stroke_width=STROKE_WIDTH))
    
    # Mounting holes
    if hd > 0:
        rc = hd / 2.0
        cx_left = w / 2.0 - cdist / 2.0
        cx_right = w / 2.0 + cdist / 2.0
        cy = h / 2.0
        
        svg_parts.append(create_svg_element('circle', id="hole-left", 
                                           cx=cx_left, cy=cy, r=rc,
                                           fill="none", stroke=RED, 
                                           stroke_width=STROKE_WIDTH))
        svg_parts.append(create_svg_element('circle', id="hole-right", 
                                           cx=cx_right, cy=cy, r=rc,
                                           fill="none", stroke=RED, 
                                           stroke_width=STROKE_WIDTH))

def calculate_textbox2_font_size(config, fonts, max_width):
    """Calculate the font size for textbox2 (middle section)."""
    text_config = config['text']
    
    def get_line_width(line_config, fs):
        width = 0
        if line_config['label']:
            width += get_text_width_mm(line_config['label'], 
                                      fonts['arial-bold'] if line_config['label_bold'] else fonts['arial'], 
                                      fs, is_bold=line_config['label_bold'])
            if line_config['value']:
                width += get_text_width_mm(' ', fonts['arial'], fs, is_bold=False)  # Space between
        if line_config['value']:
            width += get_text_width_mm(line_config['value'], 
                                      fonts['arial-bold'] if line_config['value_bold'] else fonts['arial'], 
                                      fs, is_bold=line_config['value_bold'])
        return width
    
    def textbox2_metrics(fs):
        # Count non-empty lines
        line_count = 0
        max_w = 0
        
        for line_key in ['product_line', 'version_line', 'serial_line', 'rating_line']:
            line_config = text_config.get(line_key, {})
            if line_config.get('label') or line_config.get('value'):
                line_count += 1
                line_w = get_line_width(line_config, fs)
                max_w = max(max_w, line_w)
        
        return (line_count, max_w, fs * LINE_HEIGHT_MULTIPLIER * line_count)
    
    return calculate_max_font_size(textbox2_metrics, max_width)

def calculate_textbox3_font_size(text, width, fonts, max_font_size):
    """Calculate the font size for textbox3 (bottom section)."""
    def textbox3_metrics(fs):
        lines = wrap_text_to_width(text, width, fonts['arial'], fs, is_bold=False)
        if len(lines) > 2:
            return (lines, float('inf'), float('inf'))  # Reject if more than 2 lines
        max_w = max(get_text_width_mm(line, fonts['arial'], fs, is_bold=False) 
                   for line in lines) if lines else 0
        return (lines, max_w, fs * LINE_HEIGHT_MULTIPLIER * len(lines))
    
    return calculate_max_font_size(textbox3_metrics, width, max_font_size=max_font_size)

def add_top_section(svg_parts, w, h, hd, y2_top, fonts, company_name, config):
    """Add the top section containing logo, text, and square."""
    # Get layout config
    layout = config.get('layout', {})
    textbox1_overlap = layout.get('textbox1_overlap_with_logo', -0.01)
    textbox1_square_padding = layout.get('textbox1_padding_from_square', 0.02)
    
    # Calculate logo position and size
    logo_available_height = y2_top * (1 - 2 * LOGO_PADDING_TOP_BOTTOM)
    logo_y_start = y2_top * LOGO_PADDING_TOP_BOTTOM
    logo_x_start = w * LOGO_PADDING_LEFT
    logo_scale = logo_available_height / LOGO_ORIGINAL_HEIGHT
    logo_width = LOGO_ORIGINAL_WIDTH * logo_scale
    logo_height = LOGO_ORIGINAL_HEIGHT * logo_scale
    
    # Add logo
    svg_parts.append(f'  <g id="logo" transform="translate({logo_x_start}, {logo_y_start}) scale({logo_scale})">')
    svg_parts.append(f'    <path id="logo-path" d="{LOGO_PATH_DATA}" fill="{BLACK}" stroke="none"/>')
    svg_parts.append('  </g>')
    
    # Calculate and add black square
    hole_top_y = h / 2.0 - hd / 2.0
    square_size = hole_top_y * (1 - 2 * SQUARE_PADDING_TOP_BOTTOM)
    square_y = hole_top_y * SQUARE_PADDING_TOP_BOTTOM
    square_x = w - (w * SQUARE_PADDING_RIGHT) - square_size
    
    svg_parts.append(create_svg_element('rect', id="square", x=square_x, y=square_y, 
                                       width=square_size, height=square_size,
                                       fill=BLACK, stroke="none"))
    
    # Calculate textbox1 (company name) font size and position
    textbox1_x_start = logo_x_start + logo_width - (w * textbox1_overlap)
    textbox1_x_end = square_x - (w * textbox1_square_padding)
    textbox1_available_width = textbox1_x_end - (logo_x_start + logo_width)
    
    # Max font height constraint: logo height with 1% padding
    max_font_height = logo_height * (1 - TEXTBOX1_LOGO_HEIGHT_PADDING)
    
    def textbox1_metrics(fs):
        # Assume "Voting" is bold and "Works" is regular for VotingWorks
        if company_name == "VotingWorks":
            voting_width = get_text_width_mm("Voting", fonts['roboto'], fs, is_bold=True)
            works_width = get_text_width_mm("Works", fonts['roboto'], fs, is_bold=False)
            text_width = voting_width + works_width
        else:
            text_width = get_text_width_mm(company_name, fonts['roboto'], fs, is_bold=False)
        return (1, text_width, fs)
    
    font_size_textbox1 = calculate_max_font_size(textbox1_metrics, textbox1_available_width, 
                                                max_height=max_font_height,
                                                max_font_size=TEXTBOX1_MAX_FONT_SIZE)
    
    # Position text with bottom aligned to bottom of logo
    logo_bottom_y = logo_y_start + logo_height
    
    # Special handling for VotingWorks with bold "Voting"
    if company_name == "VotingWorks":
        svg_parts.append(f'  <text id="company-name" x="{textbox1_x_start}" y="{logo_bottom_y}" '
                        f'font-family="Roboto, sans-serif" font-size="{font_size_textbox1}" '
                        f'fill="black" text-anchor="start">')
        svg_parts.append(f'    <tspan font-weight="bold">Voting</tspan>Works')
        svg_parts.append('  </text>')
    else:
        svg_parts.append(create_text_element(textbox1_x_start, logo_bottom_y, company_name,
                                            "Roboto, sans-serif", font_size_textbox1, id="company-name"))

def add_middle_section(svg_parts, w, config, font_size, fonts, y2_top):
    """Add the middle section containing product info."""
    line_height = font_size * LINE_HEIGHT_MULTIPLIER
    text_config = config['text']
    
    # Build lines that have content with standardized IDs
    lines_data = []
    line_ids = ['product-line', 'serial-line', 'rating-line']
    id_index = 0
    
    for line_key in ['product_line', 'version_line', 'serial_line', 'rating_line']:
        line_config = text_config.get(line_key, {})
        if line_config.get('label') or line_config.get('value'):
            # Assign standardized ID
            if id_index < len(line_ids):
                lines_data.append((line_ids[id_index], line_config))
                id_index += 1
    
    if not lines_data:
        return
    
    # Calculate text widths for centering
    def get_line_width(line_config):
        width = 0
        if line_config['label']:
            width += get_text_width_mm(line_config['label'], 
                                      fonts['arial-bold'] if line_config['label_bold'] else fonts['arial'], 
                                      font_size, is_bold=line_config['label_bold'])
            if line_config['value']:
                width += get_text_width_mm(' ', fonts['arial'], font_size, is_bold=False)
        if line_config['value']:
            width += get_text_width_mm(line_config['value'], 
                                      fonts['arial-bold'] if line_config['value_bold'] else fonts['arial'], 
                                      font_size, is_bold=line_config['value_bold'])
        return width
    
    text_block_width = max(get_line_width(line_config) for _, line_config in lines_data)
    x_start = (w - text_block_width) / 2.0
    
    # Render each line
    y_current = y2_top + font_size
    for line_id, line_config in lines_data:
        svg_parts.append(f'  <text id="{line_id}" x="{x_start}" y="{y_current}" '
                        f'font-family="Arial, sans-serif" font-size="{font_size}" '
                        f'fill="black" text-anchor="start">')
        
        if line_config['label']:
            if line_config['label_bold']:
                svg_parts.append(f'    <tspan font-weight="bold">{line_config["label"]}</tspan>')
            else:
                svg_parts.append(f'    <tspan>{line_config["label"]}</tspan>')
            
            if line_config['value']:
                svg_parts.append(' ')  # Space between label and value
        
        if line_config['value']:
            if line_config['value_bold']:
                svg_parts.append(f'<tspan font-weight="bold">{line_config["value"]}</tspan>')
            else:
                svg_parts.append(line_config['value'])
        
        svg_parts.append('  </text>')
        y_current += line_height

def add_bottom_section(svg_parts, lines, font_size, y3_top, padding_mm):
    """Add the bottom section containing warning text."""
    line_height = font_size * LINE_HEIGHT_MULTIPLIER
    x_start = padding_mm
    y_current = y3_top + font_size
    
    for i, line in enumerate(lines):
        # Standardized IDs: warning-line-1, warning-line-2
        svg_parts.append(create_text_element(x_start, y_current, line,
                                            "Arial, sans-serif", font_size, 
                                            id=f"warning-line-{i+1}"))
        y_current += line_height

# ============================================================================
# MAIN SVG BUILDER
# ============================================================================

def build_svg(config, fonts):
    """Build the complete SVG nameplate."""
    # Extract dimensions from config
    dims = config['dimensions']
    w = float(dims['width'])
    h = float(dims['height'])
    r = min(float(dims['corner_radius']), w / 2.0, h / 2.0)  # Clamp radius
    hd = max(0.0, float(dims['hole_diameter']))
    cdist = max(0.0, float(dims['hole_center_distance']))
    
    # Extract text config
    text_config = config['text']
    
    # Calculate font sizes for text sections
    max_textbox2_width = cdist * TEXTBOX2_MAX_WIDTH_RATIO
    font_size_textbox2 = calculate_textbox2_font_size(config, fonts, max_textbox2_width)
    
    warning_text = text_config.get('warning_text', '')
    textbox3_side_padding_mm = w * TEXTBOX3_SIDE_PADDING_RATIO
    textbox3_width = w - (2 * textbox3_side_padding_mm)
    font_size_textbox3 = calculate_textbox3_font_size(warning_text, textbox3_width, 
                                                      fonts, font_size_textbox2)
    
    # Calculate section heights for middle section
    line_height_textbox2 = font_size_textbox2 * LINE_HEIGHT_MULTIPLIER
    
    # Count actual lines in middle section
    middle_line_count = 0
    for line_key in ['product_line', 'version_line', 'serial_line', 'rating_line']:
        line_config = text_config.get(line_key, {})
        if line_config.get('label') or line_config.get('value'):
            middle_line_count += 1
    
    textbox2_height = line_height_textbox2 * middle_line_count
    
    textbox3_lines = wrap_text_to_width(warning_text, textbox3_width, 
                                       fonts['arial'], font_size_textbox3)
    textbox3_height = font_size_textbox3 * LINE_HEIGHT_MULTIPLIER * len(textbox3_lines)
    
    # Calculate vertical layout positions
    y2_top = (h - textbox2_height) / 2.0  # Center textbox2 vertically
    space_below = h - (y2_top + textbox2_height)
    gap_below = (space_below - textbox3_height) / 2.0
    y3_top = y2_top + textbox2_height + gap_below
    
    # Build SVG
    svg_parts = []
    svg_parts.append('<?xml version="1.0" encoding="UTF-8" standalone="no"?>')
    svg_parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}mm" height="{h}mm" viewBox="0 0 {w} {h}">')
    
    # Add main components
    add_outline_and_holes(svg_parts, w, h, r, hd, cdist)
    add_top_section(svg_parts, w, h, hd, y2_top, fonts, text_config.get('company_name', 'VotingWorks'), config)
    add_middle_section(svg_parts, w, config, font_size_textbox2, fonts, y2_top)
    add_bottom_section(svg_parts, textbox3_lines, font_size_textbox3, 
                      y3_top, textbox3_side_padding_mm)
    
    svg_parts.append('</svg>')
    return "\n".join(svg_parts)

# ============================================================================
# USER INTERFACE
# ============================================================================

def prompt_float(prompt, default=None, min_val=None):
    """Prompt user for a floating-point value."""
    while True:
        raw = input(f"{prompt}" + (f" [{default}]" if default is not None else "") + ": ").strip()
        if not raw and default is not None:
            raw = str(default)
        try:
            val = float(raw)
            if min_val is not None and val < min_val:
                print(f"  Value must be >= {min_val}.")
                continue
            return val
        except ValueError:
            print("  Please enter a numeric value.")

def prompt_string(prompt, default=None):
    """Prompt user for a string value."""
    raw = input(f"{prompt}" + (f" [{default}]" if default is not None else "") + ": ").strip()
    if not raw and default is not None:
        return default
    return raw

def prompt_boolean(prompt, default=False):
    """Prompt user for a boolean value."""
    default_str = 'Y' if default else 'N'
    raw = input(f"{prompt} [{default_str}]: ").strip().lower()
    if not raw:
        return default
    return raw in ['y', 'yes', 'true', '1']

def prompt_configuration(base_config=None):
    """Prompt user for all configuration values."""
    if base_config is None:
        config = DEFAULT_CONFIG.copy()
    else:
        # Deep copy the base configuration
        import copy
        config = copy.deepcopy(base_config)
    
    # Get dimension inputs
    print("\n--- Dimensions ---")
    config['dimensions']['width'] = prompt_float("Width (mm)", 
                                                default=config['dimensions']['width'], min_val=0.01)
    config['dimensions']['height'] = prompt_float("Height (mm)", 
                                                 default=config['dimensions']['height'], min_val=0.01)
    config['dimensions']['corner_radius'] = prompt_float("Corner radius (mm)", 
                                                        default=config['dimensions']['corner_radius'], min_val=0.0)
    config['dimensions']['hole_diameter'] = prompt_float("Hole diameter (mm)", 
                                                        default=config['dimensions']['hole_diameter'], min_val=0.0)
    config['dimensions']['hole_center_distance'] = prompt_float("Center distance between holes (mm)", 
                                                               default=config['dimensions']['hole_center_distance'], min_val=0.0)
    
    # Get layout inputs
    print("\n--- Layout ---")
    if 'layout' not in config:
        config['layout'] = {}
    config['layout']['textbox1_overlap_with_logo'] = prompt_float(
        "Textbox1 overlap with logo (negative=overlap, positive=gap)", 
        default=config.get('layout', {}).get('textbox1_overlap_with_logo', -0.01))
    config['layout']['textbox1_padding_from_square'] = prompt_float(
        "Textbox1 padding from square", 
        default=config.get('layout', {}).get('textbox1_padding_from_square', 0.02), 
        min_val=0.0)
    
    # Get text content inputs
    print("\n--- Text Content ---")
    config['text']['company_name'] = prompt_string("Company name", 
                                                  default=config['text']['company_name'])
    
    # Product line
    print("\nProduct Line:")
    config['text']['product_line']['label'] = prompt_string("  Label", 
                                                           default=config['text']['product_line']['label'])
    config['text']['product_line']['value'] = prompt_string("  Value", 
                                                           default=config['text']['product_line']['value'])
    if config['text']['product_line']['label']:
        config['text']['product_line']['label_bold'] = prompt_boolean("  Label bold?", 
                                                                     default=config['text']['product_line']['label_bold'])
    if config['text']['product_line']['value']:
        config['text']['product_line']['value_bold'] = prompt_boolean("  Value bold?", 
                                                                     default=config['text']['product_line']['value_bold'])
    
    # Serial line
    print("\nSerial Line:")
    config['text']['serial_line']['label'] = prompt_string("  Label", 
                                                          default=config['text']['serial_line']['label'])
    config['text']['serial_line']['value'] = prompt_string("  Value", 
                                                          default=config['text']['serial_line']['value'])
    if config['text']['serial_line']['label']:
        config['text']['serial_line']['label_bold'] = prompt_boolean("  Label bold?", 
                                                                    default=config['text']['serial_line']['label_bold'])
    if config['text']['serial_line']['value']:
        config['text']['serial_line']['value_bold'] = prompt_boolean("  Value bold?", 
                                                                    default=config['text']['serial_line']['value_bold'])
    
    # Rating line
    print("\nRating Line:")
    config['text']['rating_line']['label'] = prompt_string("  Label", 
                                                          default=config['text']['rating_line']['label'])
    config['text']['rating_line']['value'] = prompt_string("  Value", 
                                                          default=config['text']['rating_line']['value'])
    if config['text']['rating_line']['label']:
        config['text']['rating_line']['label_bold'] = prompt_boolean("  Label bold?", 
                                                                    default=config['text']['rating_line']['label_bold'])
    if config['text']['rating_line']['value']:
        config['text']['rating_line']['value_bold'] = prompt_boolean("  Value bold?", 
                                                                    default=config['text']['rating_line']['value_bold'])
    
    # Warning text
    config['text']['warning_text'] = prompt_string("\nWarning text", 
                                                  default=config['text']['warning_text'])
    
    return config

def ensure_output_directory():
    """Ensure the output directory exists."""
    outdir = os.path.join(".", "assets", "templates")
    os.makedirs(outdir, exist_ok=True)
    return outdir

# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

def main():
    """Main program entry point."""
    print("=== Nameplate SVG Generator ===")
    
    # Load fonts
    print("\nLoading fonts...")
    fonts = {
        'roboto': load_font(FONT_PATHS['roboto']),
        'arial': load_font(FONT_PATHS['arial']),
        'arial-bold': load_font(FONT_PATHS['arial-bold'])
    }
    
    # Check font loading status
    for name, font in fonts.items():
        if font is None:
            print(f"Warning: Could not load {name} font, using estimation fallback")
    
    # Load existing configurations
    products = load_config_file()
    
    # Select or create configuration
    selected_config = None
    should_modify = True
    
    if products:
        selected_config, should_modify = select_product_from_config(products)
    
    # Prompt for configuration
    if selected_config and not should_modify:
        # Use config as-is
        print("\nUsing configuration without modifications.")
        config = selected_config
    elif selected_config and should_modify:
        print("\nModifying selected configuration. Press Enter to keep existing values.")
        config = prompt_configuration(selected_config)
    else:
        print("\nNo configuration selected. Using defaults.")
        config = prompt_configuration()
    
    # Generate SVG
    svg_text = build_svg(config, fonts)
    
    # Save to file
    outdir = ensure_output_directory()
    product_name = config['text']['product_line']['label'] or ''
    version = config['text']['product_line']['value'] or ''
    serial = config['text']['serial_line']['value'] or ''
    
    # Build filename
    fname_parts = ['nameplate', product_name]
    if version:
        fname_parts.append(version)
    if serial:
        fname_parts.append(serial)
    fname = '_'.join(fname_parts).replace(' ', '_').replace('/', '_') + '.svg'
    
    outpath = os.path.join(outdir, fname)
    
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(svg_text)
    
    print(f"\nSaved: {outpath}")
    
    # Offer to save configuration
    if should_modify:
        prompt_for_save(config, products)

if __name__ == "__main__":
    main()