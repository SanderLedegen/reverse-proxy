const http = require('http')
const https = require('https')
const { URL } = require('url')
const HttpStatus = require('http-status-codes')
const log4js = require('log4js')
const configuration = require('./config')
const { getErrorPage } = require('./utils')

const config = configuration.getConfig()
const logger = log4js.getLogger('reverse-proxy')
logger.level = config.logging.level || 'info'

if (config.environment === 'DEVELOPMENT') {
  // To prevent "Error: self signed certificate" while developing with bogus/invalid certificates.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

/**
 * Gets the port for a given hostname and, optionally, subdomain.
 *
 * @param {string} hostname The hostname to get the port for (e.g. 'xyz.com', 'localhost',
 * 'xyz.localhost')
 * @returns {(number|null)} the port as a number, or, if not found, null
 */
function getPortForHostName(hostname) {
  const siteName = Object.keys(config.hosts || {})
    .find(h => hostname.includes(config.hosts[h].host))
  const matchedHost = config.hosts[siteName]

  if (!matchedHost) {
    logger.debug(`None of the specified hosts included an entry for ${hostname}.`)
    return null
  }

  // The host is equal to the incoming hostname, meaning there's no subdomain.
  if (matchedHost.host === hostname) {
    logger.trace(`Direct match (no subdomain) found for specified host ${matchedHost.host} and incoming hostname ${hostname}.`)
    return matchedHost.port
  }

  // The hostname only includes a part of the host, so there's a subdomain.
  const subdomain = hostname.substring(0, hostname.indexOf('.'))
  const subdomainPort = matchedHost.subdomains[subdomain]

  if (!subdomainPort) {
    logger.trace(`No entry found for subdomain ${subdomain} in ${siteName}.`)
    return null
  }

  logger.trace(`Subdomain ${subdomain} found for specified host ${matchedHost.host}.`)
  return subdomainPort
}

// Redirect from HTTP to HTTPS.
const httpServer = http.createServer((req, res) => {
  let { host } = req.headers

  if (host.includes(':')) {
    host = host.substring(0, host.indexOf(':'))
    logger.trace(`${req.headers.host} -> ${host}`)
  }

  const redirectUri = `https://${host}${req.url}`
  logger.debug(`Received HTTP request for ${host}, trying to redirect to ${redirectUri} instead.`)
  res.writeHead(HttpStatus.MOVED_PERMANENTLY, { Location: redirectUri })
  res.end()
})

const httpsServer = https.createServer(configuration.getCertificate(), (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`)
  const port = getPortForHostName(url.hostname)

  if (!port) {
    logger.debug(`Port was not found for hostname ${url.hostname}.`)

    const html = getErrorPage(HttpStatus.NOT_FOUND)

    res.writeHead(HttpStatus.NOT_FOUND, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
    })
    res.end(html)

    return
  }

  logger.trace(`Following port was found for hostname ${url.hostname}: ${port}.`)

  const options = {
    protocol: 'http:', // url.protocol
    // host: url.host,
    hostname: 'localhost',
    port,
    method: req.method,
    path: url.pathname,
    headers: req.headers,
  }

  logger.trace('Options passed along to make a request to the origin server', options)

  const clientReq = http.request(options, (serverRes) => {
    res.writeHead(serverRes.statusCode, serverRes.statusMessage, serverRes.headers)
    serverRes.pipe(res)
  })

  clientReq.on('error', (err) => {
    if (err.errno === 'ECONNREFUSED') {
      logger.error(`Could not connect to http://${url.hostname}:${port}.`)

      const html = getErrorPage(HttpStatus.BAD_GATEWAY)

      res.writeHead(HttpStatus.BAD_GATEWAY, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
      })
      res.end(html)
    } else if (err.errno === 'ETIMEDOUT') {
      logger.error('Timeout: the origin server did not respond in time.')

      const html = getErrorPage(HttpStatus.GATEWAY_TIMEOUT)

      res.writeHead(HttpStatus.GATEWAY_TIMEOUT, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
      })
      res.end(html)
    } else {
      logger.error(`An error occurred while connecting to the origin server: ${err}`)
      res.end(err)
    }
  })

  req.pipe(clientReq)
})

// Finally kick off both servers! 😎
httpServer.listen(config.httpPort, () => {
  logger.info(`Listening for connections in ${config.environment} mode on port ${config.httpPort} (HTTP).`)
})

httpsServer.listen(config.httpsPort, () => {
  logger.info(`Listening for connections in ${config.environment} mode on port ${config.httpsPort} (HTTPS).`)
})

process.on('uncaughtException', (err) => {
  logger.fatal(err)
  process.exit(1)
})

process.on('SIGINT', () => {
  logger.info('Received SIGINT; shutting down...')
  httpServer.close()
  httpsServer.close()
})
