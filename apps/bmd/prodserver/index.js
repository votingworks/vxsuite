import express from 'express'
import * as proxy from '../src/setupProxy'

const app = express()
const port = 3000

proxy(app)
app.use('/', express.static('../build'))

// eslint-disable-next-line no-console
app.listen(port, () => console.log(`BMD listening on port ${port}!`))
