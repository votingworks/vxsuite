find src/data -type f -not -name index.ts -exec rm {} \;
./node_modules/.bin/res-to-ts --rootDir data --outDir src/data \
    'data/**/*.{csv,jpeg,jpg,json,jsonl,pdf,png,txt,xml,zip}' \
    '!data/**/castVoteRecords/**/*.{csv,jpeg,jpg,json,jsonl,pdf,png,txt,xml,zip}' \
    'data/**/castVoteRecords'
