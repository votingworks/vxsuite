import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { ControlType, ScannerState, ScanSide } from './control.js';
import { PACKAGE_ROOT } from './package_root.js';

function rustSource(file: string): string {
  return readFileSync(join(PACKAGE_ROOT, 'rust/src', file), 'utf8');
}

test.each<[string, number]>([
  ['CTYPE_ERROR: u32', ControlType.Error],
  ['CTYPE_STATUS: u32', ControlType.Status],
  ['CTYPE_FEEDER: u32', ControlType.Feeder],
  ['CTYPE_SCANERROR_UNKNOWN: u32', ControlType.ScanErrorUnknown],
  ['CTYPE_SCANERROR_INTERLOCK: u32', ControlType.ScanErrorInterlock],
  ['CTYPE_SCANERROR_PAPERINSIDE: u32', ControlType.ScanErrorPaperInside],
  ['CTYPE_SCANERROR_PAPERJAM: u32', ControlType.ScanErrorPaperJam],
  ['CTYPE_SCANERROR_DOUBLEFEED: u32', ControlType.ScanErrorDoubleFeed],
  ['INO_IP_SCANSIDE_FRONT: i32', ScanSide.Front],
  ['INO_IP_SCANSIDE_BACK: i32', ScanSide.Back],
])('%s matches the vendor header', (declaration, value) => {
  expect(rustSource('ffi.rs')).toContain(
    `pub const ${declaration} = ${value};`
  );
});

test('scanner states match the driver', () => {
  const driver = rustSource('driver.rs');
  for (const [name, value] of Object.entries(ScannerState)) {
    expect(driver).toContain(`${value} => Self::${name},`);
  }
});
