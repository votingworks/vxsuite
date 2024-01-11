// Echos stdin to stdout

process.stdin.resume();
process.stdin.on('data', (chunk) => {
  process.stdout.write(chunk);
});
