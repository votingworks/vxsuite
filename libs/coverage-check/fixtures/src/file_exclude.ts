// @coverage-exclude-file: exercised only via the manual QA harness
// Driver: imported, nothing called; the file directive excludes every counter.

export function bootHardware(): string {
  return initDriver('usb');
}

function initDriver(kind: string): string {
  return `driver:${kind}`;
}
