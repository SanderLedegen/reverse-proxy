const fs = require('fs')
const path = require('path')

function getErrorPage(httpCode) {
  const filePath = path.resolve(__dirname, `error-pages/${httpCode}.html`)
  return fs.readFileSync(filePath, { encoding: 'utf8' })
}

module.exports = {
  getErrorPage,
}
