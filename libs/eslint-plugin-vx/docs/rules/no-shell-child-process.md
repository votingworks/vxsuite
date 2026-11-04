# Disallow `child_process` calls that use a shell (`vx/no-shell-child-process`)

`exec` and `execSync` from `node:child_process` always run their command through
`/bin/sh -c`, as does any `child_process` function given a truthy `shell`
option. A shell re-parses the command, so any interpolated value can inject
commands. Pass the program and its arguments separately instead, so they reach
the program as `argv` without a shell in between.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
import { exec, execSync } from 'node:child_process';
import * as cp from 'node:child_process';

execSync(`lsblk ${device}`);
promisify(cp.exec);
spawn('lsblk', [device], { shell: true });
```

Examples of **correct** code for this rule:

```ts
import { execFile, spawn } from 'node:child_process';

execFile('lsblk', [device]);
spawn('lsblk', [device]);
```

Options passed through a variable are not checked.
