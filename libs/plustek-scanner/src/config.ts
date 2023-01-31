/**
 * Configuration options to give to the plustek drivers when initializing.
 */
export interface Config {
  savepath?: string;
  'filename-format'?: string;
  'filename-beginindex'?: number;
  'paper-size'?:
    | 'A3'
    | 'A4'
    | 'A5'
    | 'B5'
    | 'B6'
    | 'Letter'
    | { left: number; top: number; right: number; bottom: number };
  source?:
    | 'ADF-Front'
    | 'ADF-Back'
    | 'ADF-Duplex'
    | 'Flatbed'
    | 'Sheetfed-Front'
    | 'Sheetfed-Back'
    | 'Sheetfed-Duplex'
    | 'Camera';
  resolution?: 100 | 150 | 200 | 300 | 600;
  mode?: 'lineart' | 'gray' | 'color';
  brightness?: number;
  contrast?: number;
  multifeed?: boolean;
  imagefmt:
    | 'jpeg'
    | 'pdf'
    | 'odf'
    | 'multi-pdf'
    | 'multi-odf'
    | 'bmp'
    | 'tif'
    | 'multi-tif';
  quality?: number;
  swdeskew?: boolean;
  swcrop?: boolean;
  thumbnail?: boolean;
  'remove-blankpage'?: number;
  borderfill?: number;
  gamma?: number;
  autoenhance?: boolean;
  lang?:
    | 'Arabic'
    | 'ChinesePRC'
    | 'ChineseTaiwan'
    | 'English'
    | 'French'
    | 'German'
    | 'Italian'
    | 'Japanese'
    | 'Korean'
    | 'Polish'
    | 'Portuguese'
    | 'Russian'
    | 'Spanish'
    | 'Turkish';
  autodensity?: boolean;
  'remove-background'?: boolean;
  'character-enhancement'?: boolean;
  'remove-punchhold'?: boolean;
}

/**
 * Default values for initializing the plustek drivers.
 */
export const DEFAULT_CONFIG: Readonly<Config> = {
  'filename-format': 'PIC-tick-3',
  'filename-beginindex': 1,
  'paper-size': 'Letter',
  source: 'ADF-Duplex',
  resolution: 300,
  mode: 'gray',
  brightness: 0,
  contrast: 0,
  multifeed: true,
  imagefmt: 'jpeg',
  quality: 80,
  swdeskew: false,
  swcrop: true,
  thumbnail: false,
  'remove-blankpage': 0,
  borderfill: 10,
  gamma: 0.8,
  autoenhance: false,
};
