// Prints out JSON of the arguments passed to this process.

process.stdout.write(JSON.stringify(process.argv.slice(2)));
