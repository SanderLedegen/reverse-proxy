const http = require('http')
const https = require('https')
const path = require('path')
const { URL } = require('url')
const constants = require('constants')
const HttpStatus = require('http-status-codes')
const Koa = require('koa')
const gzip = require('koa-compress')
const serve = require('koa-static')
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

const app = new Koa()
const publicPath = path.resolve(__dirname, './public')

app.use(gzip())
app.use(serve(publicPath))

/**
 * Gets the port or folder for a given hostname.
 *
 * @param {string} hostname The hostname to get the port or folder for (e.g. 'xyz.com', 'localhost',
 * 'xyz.localhost')
 * @returns {(number|string|null)} the port as a number, the folder as string, or, if not found,
 * null
 */
function getActionForHostName(hostname) {
  const siteName = Object.keys(config.hosts || {})
    .find(h => hostname === config.hosts[h].host)
  const matchedHost = config.hosts[siteName]

  if (!matchedHost) {
    logger.debug(`None of the specified hosts included an entry for ${hostname}.`)
    return null
  }

  if (matchedHost.port) {
    logger.trace(`Port ${matchedHost.port} was found for specified host ${hostname}`)
    return matchedHost.port
  } else if (matchedHost.folder) {
    logger.trace(`Folder '${matchedHost.folder}' was found for specified host ${hostname}`)
    return matchedHost.folder
  }

  logger.warn(`No port or folder was specified in the configuration for ${siteName}.`)
  return null
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

const httpsServerOptions = {
  ...configuration.getCertificate(),
  secureOptions: constants.SSL_OP_NO_TLSv1,
}

const httpsServer = https.createServer(httpsServerOptions, (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`)
  const action = getActionForHostName(url.hostname)
  let port = null
  let folder = null

  if (typeof action === 'number') {
    port = action
  } else if (typeof action === 'string') {
    folder = action
  }

  if (!port && !folder) {
    const html = getErrorPage(HttpStatus.NOT_FOUND)

    res.writeHead(HttpStatus.NOT_FOUND, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
    })
    res.end(html)

    return
  }

  if (port) {
    const options = {
      protocol: 'http:', // url.protocol
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
  }

  if (folder) {
    req.url = `${folder}/${req.url}`
    app.callback()(req, res)
  }
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
