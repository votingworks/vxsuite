#!/usr/bin/env python3
"""
generate_nameplate_svg.py — Bullets 1–2 + 3a (HARD-CODED logo paths)
- Units: mm (fixed)
- Outline: white fill, red #FF0000 stroke @ 0.1 mm (always on)
- Corners: rx == ry (single radius prompt)
- Holes (2): vertically centered; user inputs diameter and center distance
- 3a Logo: embedded paths from your reference SVG (id/label "Votingworks-logo").
           Kept as paths; scaled relative to font size (in points) and vertically
           anchored with the *block’s baseline* at y = height/3.
  (If you want geometric center alignment, we can add a bbox pass next.)
- Saves to ./outputs/templates
"""

import os

RED = "#FF0000"
STROKE_W = 0.1  # mm
MARGIN_MM = 4.0
PT_TO_MM = 25.4 / 72.0  # 1 pt = 0.352777... mm

# --- Hard-coded logo group from source SVG (paths preserved) ---
LOGO_GROUP = r"""<g style="fill:#000000;fill-opacity:1;" id="g1" transform="matrix(0.108861,0,0,0.108861,7.9391296,5.6365757)"><path d="m 105.859,85.211 12.629,-42.2752 h 12.298 L 112.118,90.859 107.088,107.403 H 96.9391 L 102.216,90.859 84.5302,42.9358 h 12.629 z" fill="#000000" id="path1-4" style="fill:#000000;fill-opacity:1"/><path d="m 125.889,76.9174 v -0.7706 c 0,-2.9113 0.417,-5.5909 1.252,-8.0367 0.834,-2.471 2.049,-4.6116 3.645,-6.422 1.595,-1.8104 3.559,-3.2172 5.891,-4.2202 2.332,-1.0275 5.003,-1.5412 8.014,-1.5412 2.986,0 5.644,0.5137 7.977,1.5412 2.332,1.003 4.332,2.4098 5.928,4.2202 1.62,1.8104 2.847,3.951 3.682,6.422 0.834,2.4458 1.252,5.1254 1.252,8.0367 v 0.7706 c 0,2.9113 -0.417,5.6033 -1.252,8.0743 -0.835,2.4458 -2.062,4.5738 -3.682,6.3842 -1.596,1.8104 -3.596,3.2304 -5.928,4.258 -2.333,1.0275 -4.991,1.5412 -7.977,1.5412 -3.011,0 -5.682,-0.5137 -8.014,-1.5412 -2.332,-1.0276 -4.296,-2.4476 -5.891,-4.258 -1.596,-1.8104 -2.811,-3.9384 -3.645,-6.3842 -0.835,-2.471 -1.252,-5.163 -1.252,-8.0743 z m 10.074,0 c 0,1.834 0.176,3.5206 0.527,5.0596 0.351,1.539 0.908,2.8742 1.671,4.0058 0.789,1.1062 1.835,1.9848 3.138,2.6358 1.327,0.651 2.986,0.9764 4.978,0.9764 1.966,0 3.6,-0.3254 4.903,-0.9764 1.327,-0.651 2.373,-1.5296 3.138,-2.6358 0.789,-1.1316 1.346,-2.4668 1.671,-4.0058 0.351,-1.539 0.527,-3.2256 0.527,-5.0596 v -0.7706 c 0,-1.834 -0.176,-3.5082 -0.527,-5.0226 -0.325,-1.539 -0.882,-2.8742 -1.671,-4.0058 -0.765,-1.1316 -1.811,-2.0102 -3.138,-2.6358 -1.303,-0.651 -2.937,-0.9764 -4.903,-0.9764 -1.992,0 -3.651,0.3254 -4.978,0.9764 -1.303,0.6256 -2.349,1.5042 -3.138,2.6358 -0.763,1.1316 -1.32,2.4668 -1.671,4.0058 -0.351,1.5144 -0.527,3.1886 -0.527,5.0226 z" fill="#000000" id="path2" style="fill:#000000;fill-opacity:1"/><path d="m 197.284,59.8006 v 10.074 c -1.514,-0.6782 -3.078,-1.1806 -4.691,-1.507 -1.589,-0.3512 -3.203,-0.5268 -4.84,-0.5268 -1.49,0 -2.761,0.2248 -3.814,0.6744 -1.029,0.4252 -1.872,1.032 -2.53,1.8197 -0.658,0.7636 -1.148,1.6706 -1.469,2.7209 -0.321,1.0503 -0.482,2.182 -0.482,3.3952 v 27.916 h -10.074 V 72.442 c 0,-2.2584 0.339,-4.346 1.017,-6.2628 0.678,-1.9422 1.681,-3.6392 3.011,-5.091 1.355,-1.452 3.036,-2.5962 5.042,-3.4326 2.031,-0.8364 4.371,-1.2546 7.019,-1.2546 1.94,0 3.756,0.1888 5.449,0.5664 1.718,0.3776 3.31,0.9402 4.777,1.6882 z" fill="#000000" id="path3" style="fill:#000000;fill-opacity:1"/><path d="m 245.452,100.434 h -10.037 v -5.666 c -1.355,1.992 -3.061,3.551 -5.117,4.677 -2.03,1.126 -4.457,1.689 -7.281,1.689 -2.332,0 -4.447,-0.401 -6.346,-1.203 -1.874,-0.802 -3.477,-1.917 -4.803,-3.344 -1.327,-1.452 -2.347,-3.188 -3.062,-5.209 -0.715,-2.021 -1.072,-4.208 -1.072,-6.559 V 59.8006 h 10.074 v 23.0336 c 0,2.3578 0.703,4.2456 2.108,5.6628 1.431,1.4172 3.337,2.1258 5.718,2.1258 1.617,0 3.023,-0.3134 4.219,-0.9402 1.222,-0.6266 2.2,-1.4938 2.936,-2.6016 0.762,-1.1078 1.327,-2.4222 1.695,-3.9432 0.367,-1.5466 0.551,-3.2448 0.551,-5.0944 V 59.8006 h 10.074 z" fill="#000000" id="path4" style="fill:#000000;fill-opacity:1"/><path d="m 257.773,91.3684 6.895,-35.2628 h 9.491 L 265.37,100.434 h -7.198 l -10.41,-44.3284 h 9.491 z" fill="#000000" id="path5" style="fill:#000000;fill-opacity:1"/><path d="m 280.268,50.083 h 10.074 v 50.351 h -10.074 z" fill="#000000" id="path6" style="fill:#000000;fill-opacity:1"/><path d="m 303.419,68.231 v 32.203 h -10.074 V 59.8006 h 8.62 l 1.529,6.6336 c 1.363,-2.3818 3.016,-4.2234 4.959,-5.5248 1.968,-1.3014 4.233,-1.9522 6.796,-1.9522 0.365,0 0.707,0.0122 1.029,0.0366 0.346,0.0244 0.68,0.061 1.003,0.11 v 8.5822 c -0.698,-0.1488 -1.459,-0.2376 -2.283,-0.2664 -0.799,-0.0534 -1.541,-0.08 -2.225,-0.08 -2.283,0 -4.199,0.3392 -5.747,1.0176 -1.524,0.6782 -2.734,1.5806 -3.629,2.7074 -0.869,1.1268 -1.495,2.407 -1.878,3.8418 -0.358,1.4094 -0.536,2.897 -0.536,4.4632 z" fill="#000000" id="path7" style="fill:#000000;fill-opacity:1"/><path d="m 336.928,50.083 h 10.074 v 50.351 h -10.074 z" fill="#000000" id="path8" style="fill:#000000;fill-opacity:1"/><path d="m 381.162,99.386 c -1.617,0.4998 -3.478,0.7498 -5.584,0.7498 -2.535,0 -4.702,-0.401 -6.497,-1.203 -1.771,-0.802 -3.186,-1.917 -4.246,-3.344 -1.035,-1.427 -1.553,-3.113 -1.553,-5.059 V 66.2042 h -7.052 v -6.4036 h 7.052 V 49.4086 l 10.111,-3.3024 v 13.5958 h 9.568 v 6.4036 h -9.568 v 23.4722 c 0,1.101 0.333,1.9522 1.003,2.5536 0.671,0.5756 1.583,0.8634 2.736,0.8634 0.733,0 1.421,-0.0888 2.063,-0.2664 0.668,-0.2026 1.278,-0.443 1.827,-0.7212 z" fill="#000000" id="path9" style="fill:#000000;fill-opacity:1"/><path d="m 424.172,62.5816 c -0.251,-0.0488 -0.697,-0.0976 -1.34,-0.1464 -0.618,-0.0732 -1.284,-0.1098 -1.998,-0.1098 -2.181,0 -4.107,0.3506 -5.777,1.0518 -1.646,0.6778 -2.981,1.6308 -4.005,2.858 L 410.017,100.434 H 399.943 V 59.8006 h 8.922 l 1.341,6.3302 c 1.59,-2.2834 3.517,-3.9946 5.777,-5.1336 2.283,-1.1636 4.828,-1.7454 7.636,-1.7454 0.366,0 0.687,0.0171 0.965,0.0513 0.302,0.0342 0.547,0.0805 0.741,0.1387 z" fill="#000000" id="path10" style="fill:#000000;fill-opacity:1"/><path d="m 476.936,86.0712 2.406,4.5386 c -1.095,0.476 -2.357,0.8928 -3.785,1.2506 -1.404,0.3578 -2.961,0.5516 -4.671,0.5814 -2.358,0 -4.471,-0.3808 -6.335,-1.1424 -1.84,-0.7616 -3.399,-1.8138 -4.677,-3.1566 -1.278,-1.3428 -2.269,-2.9296 -2.972,-4.7606 -0.679,-1.8574 -1.017,-3.863 -1.017,-6.0168 V 59.8006 h 10.074 v 17.393 c 0,2.2838 0.65,4.1112 1.953,5.4822 1.303,1.345 3.057,2.0176 5.262,2.0176 0.738,0 1.412,-0.0586 2.025,-0.1758 0.637,-0.1418 1.216,-0.3254 1.738,-0.5516 0.547,-0.251 1.02,-0.5504 1.419,-0.8982 0.373,-0.3724 0.737,-0.782 1.092,-1.2288 V 59.8006 h 10.112 v 40.6334 h -8.656 l -1.345,-5.7042 c -1.303,2.133 -3.04,3.7696 -5.212,4.9096 -2.173,1.1144 -4.796,1.679 -7.868,1.6952 -3.318,-0.031 -6.215,-0.6566 -8.689,-1.877 -2.45,-1.2464 -4.414,-2.915 -5.891,-5.006 -1.452,-2.1172 -2.188,-4.6226 -2.208,-7.5162 V 59.8006 h 10.074 v 20.8416 c 0.024,1.2518 0.262,2.4032 0.713,3.4556 0.451,1.0274 1.066,1.917 1.843,2.6688 0.803,0.7272 1.751,1.2898 2.843,1.6882 1.118,0.3494 2.33,0.52 3.638,0.5118 2.21,-0.031 4.005,-0.394 5.387,-1.0882 z" fill="#000000" id="path11" style="fill:#000000;fill-opacity:1"/><path d="m 524.076,99.8368 c -1.499,0.1832 -2.994,0.2888 -4.484,0.3168 -1.465,0.0514 -2.855,0.077 -4.169,0.077 -2.912,0 -5.572,-0.4138 -7.98,-1.2414 -2.383,-0.8276 -4.432,-2.0114 -6.144,-3.5516 -1.686,-1.5402 -2.986,-3.4016 -3.902,-5.584 -0.89,-2.208 -1.334,-4.671 -1.334,-7.3888 V 59.8006 h 10.074 v 22.5922 c 0,2.2296 0.678,4.0686 2.033,5.5182 1.354,1.4496 3.248,2.1744 5.679,2.1744 1.564,0 2.905,-0.3046 4.021,-0.9138 1.142,-0.6092 2.079,-1.4692 2.813,-2.5798 0.734,-1.1356 1.259,-2.4926 1.574,-4.071 0.341,-1.5784 0.512,-3.3388 0.512,-5.281 V 59.8006 h 10.074 v 40.6334 h -8.965 z" fill="#000000" id="path12" style="fill:#000000;fill-opacity:1"/></g>"""

def prompt_float(prompt, default=None, min_val=None):
    while True:
        raw = input(f"{prompt}" + (f" [{default}]" if default is not None else "") + ": ").strip()
        if not raw and default is not None:
            raw = str(default)
        try:
            val = float(raw)
            if min_val is not None and val < min_val:
                print(f"  Value must be >= {min_val}."); continue
            return val
        except ValueError:
            print("  Please enter a numeric value.")

def ensure_outdir():
    outdir = os.path.join(".", "outputs", "templates")
    os.makedirs(outdir, exist_ok=True)
    return outdir

def build_svg(width_mm, height_mm, radius_mm, hole_diam_mm, hole_center_dist_mm, font_size_pt):
    w = float(width_mm); h = float(height_mm)
    r = max(0.0, min(float(radius_mm), w/2.0, h/2.0))
    units = "mm"

    # Holes (vertical center y = h/2, symmetric about center)
    hd = max(0.0, float(hole_diam_mm))
    rc = hd / 2.0
    cdist = max(0.0, float(hole_center_dist_mm))
    cx_left  = w/2.0 - cdist/2.0
    cx_right = w/2.0 + cdist/2.0
    cy = h/2.0

    # Font size -> modest logo scale; tuned conservative to avoid oversized logo.
    # You can tweak the multiplier if needed.
    font_pt = float(font_size_pt)
    logo_scale = max(0.05, (font_pt / 12.0) * 0.35)  # 12pt -> 0.35, 18pt -> 0.525

    # Place logo with its block baseline at y = h/3 (approx). Left margin anchor for x.
    x_left = MARGIN_MM
    y_anchor = h / 3.0

    parts = []
    parts.append('<?xml version="1.0" encoding="UTF-8" standalone="no"?>')
    parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}{units}" height="{h}{units}" viewBox="0 0 {w} {h}">')

    # Outline
    parts.append(
        f'  <rect x="0" y="0" width="{w}" height="{h}" rx="{r}" ry="{r}" '
        f'fill="#FFFFFF" stroke="{RED}" stroke-width="{STROKE_W}"/>'
    )

    # Holes (no fill, red stroke)
    if hd > 0:
        parts.append(f'  <circle id="hole-left"  cx="{cx_left}"  cy="{cy}" r="{rc}" fill="none" stroke="{RED}" stroke-width="{STROKE_W}"/>')
        parts.append(f'  <circle id="hole-right" cx="{cx_right}" cy="{cy}" r="{rc}" fill="none" stroke="{RED}" stroke-width="{STROKE_W}"/>')

    # --- 3a: Hard-coded logo group ---
    parts.append(f'  <g id="block-logo" transform="translate({x_left},{y_anchor}) scale({logo_scale})">')
    parts.append(LOGO_GROUP)
    parts.append('  </g>')

    parts.append('</svg>')
    return "\n".join(parts)

def main():
    print("=== Nameplate SVG — Bullets 1–2 + 3a (hard-coded logo) ===")
    width    = prompt_float("Width (mm)",                         default=120, min_val=0.01)
    height   = prompt_float("Height (mm)",                        default=60,  min_val=0.01)
    radius   = prompt_float("Corner radius (mm)",                 default=4,   min_val=0.0)
    hole_d   = prompt_float("Hole diameter (mm)",                 default=4,   min_val=0.0)
    center_d = prompt_float("Center distance between holes (mm)", default=80,  min_val=0.0)
    fsize_pt = prompt_float("Base font size (pt)",                default=12.0, min_val=1.0)

    svg_text = build_svg(width, height, radius, hole_d, center_d, fsize_pt)

    outdir = ensure_outdir()
    fname = (
        f"nameplate_template_{int(round(width))}x{int(round(height))}_"
        f"{int(round(radius))}rmm_hd{int(round(hole_d))}_cd{int(round(center_d))}"
        f"_fs{int(round(fsize_pt))}pt_logo.svg"
    )
    outpath = os.path.join(outdir, fname)
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(svg_text)
    print(f"Saved: {outpath}")

if __name__ == "__main__":
    main()
