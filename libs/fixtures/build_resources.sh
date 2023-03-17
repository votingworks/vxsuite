./node_modules/.bin/res-to-ts --rootDir data --outDir src/data \
    'data/**/*.{csv,jsonl,json,txt,jpeg,jpg,png,pdf,xml,zip}' \
    '!data/**/cdf-cvr-files/**/*.{csv,jsonl,json,txt,jpeg,jpg,png,pdf,xml,zip}'  \
    'data/**/cdf-cvr-files/*'