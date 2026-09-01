// Driver: describeMode('read'), describeMode('admin'), isEditable('write'),
// isEditable('admin').

type Mode = 'read' | 'write' | 'admin';

// The empty fall-through `case 'read':` arm is never entered and is reported
// at its own label (the arm it falls into decides its reachability).
export function isEditable(mode: Mode): boolean {
  switch (mode) {
    case 'read':
    case 'write':
      return false;
    default:
      return true;
  }
}

export function describeMode(mode: Mode): string {
  switch (mode) {
    case 'read':
      return 'reader';
    // A directive before a `case X:` clause binds the whole clause (arm +
    // body).
    // @coverage-exclude: write mode disabled in this product
    case 'write':
      return 'writer';
    default:
      return 'administrator';
  }
}
