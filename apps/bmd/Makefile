
# a phony dependency that can be used as a dependency to force builds
FORCE:

build: FORCE
	pnpm install && pnpm build

run:
	cd prodserver && node index.js

demo:
	# Preserve BROWSER as DEMO_BROWSER, then tell react-scripts to use our script
	# as the browser launcher.
	pnpm install && DEMO_BROWSER=${BROWSER} BROWSER=./script/open-demo.js pnpm start
