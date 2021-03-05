const openBrowser = require('react-dev-utils/openBrowser')

// Restore original BROWSER variable and delete the placeholder.
process.env.BROWSER = process.env.DEMO_BROWSER
delete process.env.DEMO_BROWSER

// Open whatever we would have opened, but with the right path.
openBrowser(new URL('/#demo', process.argv[2]).toString())
