const path = require('path')
process.chdir(path.join(__dirname, '..', 'app'))
require(path.join(process.cwd(), 'node_modules', 'webpack-dev-server', 'bin', 'webpack-dev-server.js'))
