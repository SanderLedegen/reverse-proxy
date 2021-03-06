const fs = require('fs')
const path = require('path')

const getConfig = () => {
  const env = (process.env.NODE_ENV || 'PRODUCTION').toUpperCase()

  switch (env) {
    case 'D':
    case 'DEV':
    case 'DEVELOPMENT':
      return require('./config.dev.json')

    case 'P':
    case 'PRD':
    case 'PROD':
    case 'PRODUCTION':
    default:
      return require('./config.prd.json')
  }
}

const getCertificate = () => {
  const config = getConfig()
  const crtPath = path.resolve(__dirname, config.certificate.crt)
  const keyPath = path.resolve(__dirname, config.certificate.key)

  if (!fs.existsSync(crtPath)) {
    throw new Error(`The certificate (.crt) could not be found at ${crtPath}.`)
  }

  if (!fs.existsSync(keyPath)) {
    throw new Error(`The certificate (.key) could not be found at ${keyPath}.`)
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(crtPath),
  }
}

module.exports = {
  getConfig,
  getCertificate,
}
