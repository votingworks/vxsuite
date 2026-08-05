// @coverage-exclude-file: exercised only via the manual QA harness

export function bootHardware(): string {
  return initDriver('usb');
}

function initDriver(kind: string): string {
  return `driver:${kind}`;
}
