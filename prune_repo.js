const fs = require('node:fs');
const path = require('node:path');

packageJsonEdit('libs/ballot-interpreter', (p) => {
  p.scripts['build:self'] = 'pnpm build:ts';
  return p;
});

packageJsonEdit('libs/logging-utils', (p) => {
  p.scripts['build:self'] = 'echo 0 > /dev/null';
  return p;
});

srcEdit(repoPath('libs/auth/src/index.ts'), (src) => {
  return src.replaceAll(/^.*(card| cac |test_utils).*/gim, '');
});

srcEdit(repoPath('libs/logging-utils/index.js'), () => {
  return '';
});

srcEdit(repoPath('libs/ui/src/index.ts'), (src) => {
  return src.replaceAll(
    /^.*(battery|diagnostics|electrical_testing|export_logs|headphones|power_down|readiness_report|set_clock|system_administrator_screen_contents|system_call).*/gim,
    ''
  );
});

dirDelete(repoPath('libs/ui/src/diagnostics'));
srcDelete(repoPath('libs/ui/src/battery_display.tsx'));
srcDelete(repoPath('libs/ui/src/battery_low_alert.tsx'));
srcDelete(repoPath('libs/ui/src/battery_low_alert.tsx'));
srcDelete(repoPath('libs/ui/src/electrical_testing_screen.tsx'));
srcDelete(repoPath('libs/ui/src/export_logs_modal.tsx'));
srcDelete(repoPath('libs/ui/src/power_down_button.tsx'));
srcDelete(repoPath('libs/ui/src/set_clock.tsx'));
srcDelete(repoPath('libs/ui/src/src/ui_strings/audio_context.tsx'));
srcDelete(repoPath('libs/ui/src/system_administrator_screen_contents.tsx'));

function dirDelete(dirPath) {
  return fs.rmSync(dirPath, { force: true, recursive: true });
}

function packageJsonEdit(libPathRel, fn) {
  const package = packageJsonRead(libPathRel);
  packageJsonWrite(libPathRel, fn(package));
}

function packageJsonRead(libPathRel) {
  const data = fs.readFileSync(repoPath(libPathRel, 'package.json'), 'utf8');
  return JSON.parse(data);
}

function packageJsonWrite(libPathRel, package) {
  return srcWrite(
    repoPath(libPathRel, 'package.json'),
    JSON.stringify(package, undefined, 2),
    'package.json'
  );
}

function srcDelete(srcPath) {
  try {
    return fs.rmSync(srcPath);
  } catch {}
}

/**
 * @param {string} srcPath
 * @param {(src: string) => string} fn
 */
function srcEdit(srcPath, fn) {
  const src = srcRead(srcPath);
  srcWrite(srcPath, fn(src));
}

function srcRead(srcPath) {
  return fs.readFileSync(srcPath, 'utf8');
}

function srcWrite(srcPath, src) {
  return fs.writeFileSync(srcPath, src, 'utf8');
}

function repoPath(...pathComponents) {
  return path.join(__dirname, ...pathComponents);
}
