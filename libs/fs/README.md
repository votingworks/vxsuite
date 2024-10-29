# @votingworks/fs

File system utilities for NodeJS in the vxsuite monorepo. This package is
intended to be used _only_ in NodeJS, not in the browser. Do not use this
package in any frontends.

The functions exported by this package may duplicate functionality provided by
NodeJS's built-in `fs` module, but they are intended to be either more
convenient or safer to use. For example, `readFile` has a mandatory `maxSize`
parameter to prevent reading large files into memory.
