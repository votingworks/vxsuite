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
- Layout-first approach: textbox2 → top section → bottom section

Requires: pip install fonttools pyyaml
"""

import os, sys
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

# Font sizing constraints
MIN_FONT_SIZE = 0.5
MAX_FONT_SIZE = 20.0
TEXTBOX1_MAX_FONT_SIZE = 50.0

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
        'top_section_margin': 0.10,
        'middle_section_margin': 0.10,
        'bottom_section_margin': 0.10,
        'logo_padding_horizontal': 0.10,
        'logo_padding_vertical': 0.15,
        'square_padding_top': 0.10,
        'square_padding_right': 0.0,
        'textbox1_logo_overlap': -0.01,
        'textbox1_to_square_padding': 0.02,
        'textbox1_height_ratio': 0.66,
        'textbox3_bottom_margin': 0.05
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
# XML/SVG UTILITIES
# ============================================================================

def xml_escape(text):
    """Escape special XML/SVG characters in text."""
    if not text:
        return text
    
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    text = text.replace('"', '&quot;')
    text = text.replace("'", '&apos;')
    
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
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    
    try:
        with open(CONFIG_FILE, 'w') as f:
            yaml.dump({'products': products_config}, f, default_flow_style=False, sort_keys=False)
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
    
    default_name = config['text'].get('product_line', {}).get('label', 'Custom')
    product_name = input(f"Product name to save as [{default_name}]: ").strip()
    if not product_name:
        product_name = default_name
    
    if product_name in products:
        overwrite = input(f"'{product_name}' already exists. Overwrite? [y/N]: ").strip().lower()
        if overwrite != 'y':
            return
    
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
    """Calculate actual text width in mm using font metrics."""
    if font is None:
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
                advance_width = glyph.width
                
                pen = BoundsPen(glyph_set)
                glyph.draw(pen)
                
                if pen.bounds:
                    xMin, yMin, xMax, yMax = pen.bounds
                    bounds_width = xMax - xMin
                    total_bounds_width += max(advance_width, bounds_width)
                else:
                    total_bounds_width += advance_width
    
    width_mm = (total_bounds_width / units_per_em) * font_size_mm
    return width_mm

# ============================================================================
# TEXT WRAPPING
# ============================================================================

def wrap_text_to_width(text, max_width_mm, font, font_size_mm, is_bold=False):
    """Wrap text to fit within max_width_mm."""
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
    """Binary search to find maximum font size that satisfies constraints."""
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
    escaped_text = xml_escape(text)
    return f'  <text x="{x}" y="{y}" font-family="{font_family}" font-size="{font_size}" fill="black" text-anchor="{text_anchor}" {attr_str}>{escaped_text}</text>'

# ============================================================================
# LAYOUT CALCULATION
# ============================================================================

def calculate_textbox2_metrics(config, fonts):
    """Calculate font size and metrics for textbox2 (middle section)."""
    dims = config['dimensions']
    layout = config['layout']
    text_config = config['text']
    
    w = float(dims['width'])
    cdist = float(dims['hole_center_distance'])
    middle_margin = layout.get('middle_section_margin', 0.10)
    max_font_ratio = layout.get('textbox2_max_font_size_ratio', 0.08)
    
    # Get which lines to include
    enabled_lines = layout.get('textbox2_lines', ['product_line', 'serial_line', 'rating_line'])
    
    middle_margin_mm = w * middle_margin
    available_width = w - 2 * middle_margin_mm
    max_width = min(available_width, cdist * 0.9)
    
    # Calculate max font size from width
    max_font_from_width = w * max_font_ratio
    
    def get_line_width(line_config, fs):
        width = 0
        if line_config['label']:
            width += get_text_width_mm(line_config['label'], 
                                      fonts['arial-bold'] if line_config['label_bold'] else fonts['arial'], 
                                      fs, is_bold=line_config['label_bold'])
            if line_config['value']:
                width += get_text_width_mm(' ', fonts['arial'], fs, is_bold=False)
        if line_config['value']:
            width += get_text_width_mm(line_config['value'], 
                                      fonts['arial-bold'] if line_config['value_bold'] else fonts['arial'], 
                                      fs, is_bold=line_config['value_bold'])
        return width
    
    def textbox2_metrics(fs):
        line_count = 0
        max_w = 0
        
        for line_key in enabled_lines:
            line_config = text_config.get(line_key, {})
            if line_config.get('label') or line_config.get('value'):
                line_count += 1
                line_w = get_line_width(line_config, fs)
                max_w = max(max_w, line_w)
        
        return (line_count, max_w, fs * LINE_HEIGHT_MULTIPLIER * line_count)
    
    font_size = calculate_max_font_size(textbox2_metrics, max_width, 
                                       max_font_size=max_font_from_width)
    _, _, height = textbox2_metrics(font_size)
    
    return {
        'font_size': font_size,
        'height': height,
        'x_start': middle_margin_mm
    }


def calculate_top_section_layout(config, top_space, fonts):
    """Calculate layout for top section (logo, textbox1, square)."""
    dims = config['dimensions']
    layout = config['layout']
    text_config = config['text']
    
    w = float(dims['width'])
    h = float(dims['height'])
    hd = float(dims['hole_diameter'])
    
    top_margin = layout.get('top_section_margin', 0.10)
    logo_pad_h = layout.get('logo_padding_horizontal', 0.10)
    logo_pad_v = layout.get('logo_padding_vertical', 0.15)
    square_pad_top = layout.get('square_padding_top', 0.10)
    square_pad_right = layout.get('square_padding_right', 0.0)
    textbox1_logo_overlap = layout.get('textbox1_logo_overlap', -0.01)
    textbox1_square_pad = layout.get('textbox1_to_square_padding', 0.02)
    textbox1_height_ratio = layout.get('textbox1_height_ratio', 0.66)
    
    # Calculate square - positioned relative to hole with equal padding
    hole_top_y = h / 2.0 - hd / 2.0
    square_size = hole_top_y * (1 - 2 * square_pad_top)
    square_x = w - (w * top_margin) - (w * square_pad_right) - square_size
    square_y = hole_top_y * square_pad_top
    
    # Calculate logo with padding
    logo_left_margin = w * top_margin
    logo_padded_width_space = w - logo_left_margin - (square_x - logo_left_margin)
    logo_content_width = logo_padded_width_space * (1 - 2 * logo_pad_h)
    logo_content_height = top_space * (1 - 2 * logo_pad_v)
    
    # Logo scale by height (it's square, so we can use either dimension)
    logo_scale = logo_content_height / LOGO_ORIGINAL_HEIGHT
    logo_width = LOGO_ORIGINAL_WIDTH * logo_scale
    logo_height = LOGO_ORIGINAL_HEIGHT * logo_scale
    
    # Adjust if logo width exceeds available space
    if logo_width > logo_content_width:
        logo_scale = logo_content_width / LOGO_ORIGINAL_WIDTH
        logo_width = LOGO_ORIGINAL_WIDTH * logo_scale
        logo_height = LOGO_ORIGINAL_HEIGHT * logo_scale
    
    logo_x = logo_left_margin + (logo_padded_width_space * logo_pad_h)
    logo_y = top_space * logo_pad_v
    
    # Calculate textbox1
    textbox1_height = logo_height * textbox1_height_ratio
    # Start after logo content + logo's right padding, then apply overlap
    logo_right_padding = logo_padded_width_space * logo_pad_h
    textbox1_x_start = logo_x + logo_width + logo_right_padding + (w * textbox1_logo_overlap)
    textbox1_x_end = square_x - (w * textbox1_square_pad)
    textbox1_available_width = textbox1_x_end - textbox1_x_start
    
    company_name = text_config.get('company_name', 'VotingWorks')
    
    def textbox1_metrics(fs):
        if company_name == "VotingWorks":
            voting_width = get_text_width_mm("Voting", fonts['roboto'], fs, is_bold=True)
            works_width = get_text_width_mm("Works", fonts['roboto'], fs, is_bold=False)
            text_width = voting_width + works_width
        else:
            text_width = get_text_width_mm(company_name, fonts['roboto'], fs, is_bold=False)
        return (1, text_width, fs)
    
    font_size_textbox1 = calculate_max_font_size(textbox1_metrics, textbox1_available_width, 
                                                max_height=textbox1_height,
                                                max_font_size=TEXTBOX1_MAX_FONT_SIZE)
    
    # Align textbox1 baseline with logo bottom
    textbox1_y = logo_y + logo_height
    
    return {
        'logo': {
            'x': logo_x,
            'y': logo_y,
            'scale': logo_scale,
            'width': logo_width,
            'height': logo_height
        },
        'square': {
            'x': square_x,
            'y': square_y,
            'size': square_size
        },
        'textbox1': {
            'x': textbox1_x_start,
            'y': textbox1_y,
            'font_size': font_size_textbox1,
            'company_name': company_name
        }
    }


def calculate_textbox3_metrics(config, fonts, available_height, gap_from_textbox2, font_size_from_textbox2):
    """Calculate metrics for textbox3 using font size from textbox2."""
    dims = config['dimensions']
    layout = config['layout']
    text_config = config['text']
    
    w = float(dims['width'])
    h = float(dims['height'])
    bottom_margin = layout.get('bottom_section_margin', 0.10)
    textbox3_bottom_margin = layout.get('textbox3_bottom_margin', 0.05)
    
    bottom_margin_mm = w * bottom_margin
    available_width = w - 2 * bottom_margin_mm
    
    # Use font size from textbox2
    font_size = font_size_from_textbox2
    
    warning_text = text_config.get('warning_text', '')
    lines = wrap_text_to_width(warning_text, available_width, fonts['arial'], font_size, is_bold=False)
    
    max_w = max(get_text_width_mm(line, fonts['arial'], font_size, is_bold=False) 
               for line in lines) if lines else 0
    height = font_size * LINE_HEIGHT_MULTIPLIER * len(lines)
    
    return {
        'font_size': font_size,
        'height': height,
        'lines': lines,
        'x_start': bottom_margin_mm
    }

# ============================================================================
# SVG RENDERING
# ============================================================================

def add_outline_and_holes(svg_parts, w, h, r, hd, cdist):
    """Add the outline rectangle and mounting holes to the SVG."""
    svg_parts.append(create_svg_element('rect', id="outline", x=0, y=0, width=w, height=h, 
                                       rx=r, ry=r, fill="none", stroke=RED, 
                                       stroke_width=STROKE_WIDTH))
    
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


def render_top_section(svg_parts, top_layout):
    """Render the top section (logo, textbox1, square)."""
    logo = top_layout['logo']
    square = top_layout['square']
    textbox1 = top_layout['textbox1']
    
    # Add logo
    svg_parts.append(f'  <g id="logo" transform="translate({logo["x"]}, {logo["y"]}) scale({logo["scale"]})">')
    svg_parts.append(f'    <path id="logo-path" d="{LOGO_PATH_DATA}" fill="{BLACK}" stroke="none"/>')
    svg_parts.append('  </g>')
    
    # Add square
    svg_parts.append(create_svg_element('rect', id="square", 
                                       x=square['x'], y=square['y'], 
                                       width=square['size'], height=square['size'],
                                       fill=BLACK, stroke="none"))
    
    # Add company name
    company_name = textbox1['company_name']
    if company_name == "VotingWorks":
        svg_parts.append(f'  <text id="company-name" x="{textbox1["x"]}" y="{textbox1["y"]}" '
                        f'font-family="Roboto, sans-serif" font-size="{textbox1["font_size"]}" '
                        f'fill="black" text-anchor="start">')
        svg_parts.append(f'    <tspan font-weight="bold">{xml_escape("Voting")}</tspan>{xml_escape("Works")}')
        svg_parts.append('  </text>')
    else:
        svg_parts.append(create_text_element(textbox1['x'], textbox1['y'], company_name,
                                            "Roboto, sans-serif", textbox1['font_size'], 
                                            id="company-name"))


def render_middle_section(svg_parts, config, textbox2_metrics, y_start, fonts):
    """Render the middle section (product info)."""
    line_height = textbox2_metrics['font_size'] * LINE_HEIGHT_MULTIPLIER
    text_config = config['text']
    layout = config['layout']
    x_start = textbox2_metrics['x_start']
    
    # Get which lines to include
    enabled_lines = layout.get('textbox2_lines', ['product_line', 'serial_line', 'rating_line'])
    
    lines_data = []
    line_ids = ['product-line', 'serial-line', 'rating-line']
    id_index = 0
    
    for line_key in enabled_lines:  # Changed from hardcoded list
        line_config = text_config.get(line_key, {})
        if line_config.get('label') or line_config.get('value'):
            if id_index < len(line_ids):
                lines_data.append((line_ids[id_index], line_config))
                id_index += 1

    
    if not lines_data:
        return
    
    y_current = y_start + textbox2_metrics['font_size']
    for line_id, line_config in lines_data:
        svg_parts.append(f'  <text id="{line_id}" x="{x_start}" y="{y_current}" '
                        f'font-family="Arial, sans-serif" font-size="{textbox2_metrics["font_size"]}" '
                        f'fill="black" text-anchor="start">')
        
        if line_config['label']:
            escaped_label = xml_escape(line_config['label'])
            if line_config['label_bold']:
                svg_parts.append(f'    <tspan font-weight="bold">{escaped_label}</tspan>')
            else:
                svg_parts.append(f'    <tspan>{escaped_label}</tspan>')
            
            if line_config['value']:
                svg_parts.append(' ')
        
        if line_config['value']:
            escaped_value = xml_escape(line_config['value'])
            if line_config['value_bold']:
                svg_parts.append(f'<tspan font-weight="bold">{escaped_value}</tspan>')
            else:
                svg_parts.append(escaped_value)
        
        svg_parts.append('  </text>')
        y_current += line_height


def render_bottom_section(svg_parts, textbox3_metrics, y_start):
    """Render the bottom section (warning text)."""
    line_height = textbox3_metrics['font_size'] * LINE_HEIGHT_MULTIPLIER
    x_start = textbox3_metrics['x_start']
    y_current = y_start + textbox3_metrics['font_size']
    
    for i, line in enumerate(textbox3_metrics['lines']):
        svg_parts.append(create_text_element(x_start, y_current, line,
                                            "Arial, sans-serif", textbox3_metrics['font_size'], 
                                            id=f"warning-line-{i+1}"))
        y_current += line_height

# ============================================================================
# MAIN SVG BUILDER
# ============================================================================

def build_svg(config, fonts):
    """Build the complete SVG nameplate."""
    dims = config['dimensions']
    w = float(dims['width'])
    h = float(dims['height'])
    r = min(float(dims['corner_radius']), w / 2.0, h / 2.0)
    hd = max(0.0, float(dims['hole_diameter']))
    cdist = max(0.0, float(dims['hole_center_distance']))
    
    # Step 1: Calculate textbox2 and center it
    textbox2_metrics = calculate_textbox2_metrics(config, fonts)
    textbox2_y = (h - textbox2_metrics['height']) / 2.0
    
    # Step 2: Calculate available space for top and bottom
    top_space = textbox2_y
    bottom_space = h - (textbox2_y + textbox2_metrics['height'])
    
    # Step 3: Calculate top section layout
    top_layout = calculate_top_section_layout(config, top_space, fonts)
    
    # Step 4: Calculate gap between top section and textbox2
    # Use textbox1 baseline as the bottom of top section content
    top_content_bottom = top_layout['textbox1']['y']
    gap1 = textbox2_y - top_content_bottom
    
    # Step 5: Calculate textbox3 using same font size as textbox2
    textbox3_metrics = calculate_textbox3_metrics(config, fonts, bottom_space, gap1, textbox2_metrics['font_size'])
    textbox3_y = textbox2_y + textbox2_metrics['height'] + gap1
    
    # Build SVG
    svg_parts = []
    svg_parts.append('<?xml version="1.0" encoding="UTF-8" standalone="no"?>')
    svg_parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}mm" height="{h}mm" viewBox="0 0 {w} {h}">')
    
    add_outline_and_holes(svg_parts, w, h, r, hd, cdist)
    render_top_section(svg_parts, top_layout)
    render_middle_section(svg_parts, config, textbox2_metrics, textbox2_y, fonts)
    render_bottom_section(svg_parts, textbox3_metrics, textbox3_y)
    
    svg_parts.append('</svg>')
    return "\n".join(svg_parts)

# ============================================================================
# USER INTERFACE
# ============================================================================

def prompt_float(prompt, default=None, min_val=None, max_val=None):
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
            if max_val is not None and val > max_val:
                print(f"  Value must be <= {max_val}.")
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
        import copy
        config = copy.deepcopy(base_config)
    
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
    
    print("\n--- Layout ---")
    if 'layout' not in config:
        config['layout'] = {}
    
    config['layout']['top_section_margin'] = prompt_float(
        "Top section margin (ratio, e.g., 0.10 for 10%)", 
        default=config.get('layout', {}).get('top_section_margin', 0.10),
        min_val=0.0, max_val=0.5)
    
    config['layout']['middle_section_margin'] = prompt_float(
        "Middle section margin (ratio, e.g., 0.10 for 10%)", 
        default=config.get('layout', {}).get('middle_section_margin', 0.10),
        min_val=0.0, max_val=0.5)
    
    config['layout']['bottom_section_margin'] = prompt_float(
        "Bottom section margin (ratio, e.g., 0.10 for 10%)", 
        default=config.get('layout', {}).get('bottom_section_margin', 0.10),
        min_val=0.0, max_val=0.5)
    
    config['layout']['logo_padding_horizontal'] = prompt_float(
        "Logo horizontal padding (ratio)", 
        default=config.get('layout', {}).get('logo_padding_horizontal', 0.10),
        min_val=-0.2, max_val=0.5)
    
    config['layout']['logo_padding_vertical'] = prompt_float(
        "Logo vertical padding (ratio)", 
        default=config.get('layout', {}).get('logo_padding_vertical', 0.15),
        min_val=0.0, max_val=0.5)
    
    config['layout']['square_padding_top'] = prompt_float(
        "Square top padding (ratio)", 
        default=config.get('layout', {}).get('square_padding_top', 0.10),
        min_val=0.0, max_val=0.5)
    
    config['layout']['square_padding_right'] = prompt_float(
        "Square right padding (ratio)", 
        default=config.get('layout', {}).get('square_padding_right', 0.0),
        min_val=-0.2, max_val=0.5)
    
    config['layout']['textbox1_logo_overlap'] = prompt_float(
        "Textbox1 overlap with logo (negative=overlap, positive=gap)", 
        default=config.get('layout', {}).get('textbox1_logo_overlap', -0.01))
    
    config['layout']['textbox1_to_square_padding'] = prompt_float(
        "Textbox1 to square padding (ratio)", 
        default=config.get('layout', {}).get('textbox1_to_square_padding', 0.02),
        min_val=0.0, max_val=0.5)
    
    config['layout']['textbox1_height_ratio'] = prompt_float(
        "Textbox1 height ratio (relative to logo height)", 
        default=config.get('layout', {}).get('textbox1_height_ratio', 0.66),
        min_val=0.1, max_val=2.0)
    
    config['layout']['textbox3_bottom_margin'] = prompt_float(
        "Textbox3 bottom margin (ratio)", 
        default=config.get('layout', {}).get('textbox3_bottom_margin', 0.05),
        min_val=0.0, max_val=0.5)
    
    print("\n--- Text Content ---")
    config['text']['company_name'] = prompt_string("Company name", 
                                                  default=config['text']['company_name'])
    print("\nTextbox2 Lines (choose which lines to include):")
    print("  Available: product_line, serial_line, rating_line")
    textbox2_lines_input = prompt_string("  Lines to include (comma-separated)", 
                                     default=','.join(config.get('layout', {}).get('textbox2_lines', 
                                                     ['product_line', 'serial_line', 'rating_line'])))
    config['layout']['textbox2_lines'] = [line.strip() for line in textbox2_lines_input.split(',')]
    
    # print("\nProduct Line:")
    # config['text']['product_line']['label'] = prompt_string("  Label", 
    #                                                        default=config['text']['product_line']['label'])
    # config['text']['product_line']['value'] = prompt_string("  Value", 
    #                                                        default=config['text']['product_line']['value'])
    # if config['text']['product_line']['label']:
    #     config['text']['product_line']['label_bold'] = prompt_boolean("  Label bold?", 
    #                                                                  default=config['text']['product_line']['label_bold'])
    # if config['text']['product_line']['value']:
    #     config['text']['product_line']['value_bold'] = prompt_boolean("  Value bold?", 
    #                                                                  default=config['text']['product_line']['value_bold'])
    
    # print("\nSerial Line:")
    # config['text']['serial_line']['label'] = prompt_string("  Label", 
    #                                                       default=config['text']['serial_line']['label'])
    # config['text']['serial_line']['value'] = prompt_string("  Value", 
    #                                                       default=config['text']['serial_line']['value'])
    # if config['text']['serial_line']['label']:
    #     config['text']['serial_line']['label_bold'] = prompt_boolean("  Label bold?", 
    #                                                                 default=config['text']['serial_line']['label_bold'])
    # if config['text']['serial_line']['value']:
    #     config['text']['serial_line']['value_bold'] = prompt_boolean("  Value bold?", 
    #                                                                 default=config['text']['serial_line']['value_bold'])
    
    # print("\nRating Line:")
    # config['text']['rating_line']['label'] = prompt_string("  Label", 
    #                                                       default=config['text']['rating_line']['label'])
    # config['text']['rating_line']['value'] = prompt_string("  Value", 
    #                                                       default=config['text']['rating_line']['value'])
    # if config['text']['rating_line']['label']:
    #     config['text']['rating_line']['label_bold'] = prompt_boolean("  Label bold?", 
    #                                                                 default=config['text']['rating_line']['label_bold'])
    # if config['text']['rating_line']['value']:
    #     config['text']['rating_line']['value_bold'] = prompt_boolean("  Value bold?", 
    #                                                                 default=config['text']['rating_line']['value_bold'])
    
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
    
    print("\nLoading fonts...")
    fonts = {
        'roboto': load_font(FONT_PATHS['roboto']),
        'arial': load_font(FONT_PATHS['arial']),
        'arial-bold': load_font(FONT_PATHS['arial-bold'])
    }
    
    for name, font in fonts.items():
        if font is None:
            print(f"Warning: Could not load {name} font, using estimation fallback")
    
    products = load_config_file()
    
    if len(sys.argv) > 1:
        product_name_arg = sys.argv[1]
        matching_product = None
        for product_key in products.keys():
            if product_key.lower() == product_name_arg.lower():
                matching_product = product_key
                break
        
        if matching_product:
            print(f"\nUsing configuration for: {matching_product}")
            config = products[matching_product]
            should_modify = False
        else:
            print(f"\nProduct '{product_name_arg}' not found in configuration.")
            print("Available products:", ", ".join(products.keys()) if products else "None")
            return
    else:
        selected_config = None
        should_modify = True
        
        if products:
            selected_config, should_modify = select_product_from_config(products)
        
        if selected_config and not should_modify:
            print("\nUsing configuration without modifications.")
            config = selected_config
        elif selected_config and should_modify:
            print("\nModifying selected configuration. Press Enter to keep existing values.")
            config = prompt_configuration(selected_config)
        else:
            print("\nNo configuration selected. Using defaults.")
            config = prompt_configuration()
    
    svg_text = build_svg(config, fonts)
    
    outdir = ensure_output_directory()
    product_name = config['text']['product_line']['label'] or ''
    version = config['text']['product_line']['value'] or ''
    serial = config['text']['serial_line']['value'] or ''
    
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
    
    if len(sys.argv) == 1 and should_modify:
        prompt_for_save(config, products)

if __name__ == "__main__":
    main()