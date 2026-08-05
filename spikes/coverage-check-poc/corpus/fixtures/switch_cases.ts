// Driver: describeMode('read'), describeMode('admin').
// Locks: flag before a `case X:` clause binds the whole clause (arm + body).

type Mode = 'read' | 'write' | 'admin';

export function describeMode(mode: Mode): string {
  switch (mode) {
    case 'read':
      return 'reader';
    // @coverage-exclude: write mode disabled in this product
    case 'write':
      return 'writer';
    default:
      return 'administrator';
  }
}
