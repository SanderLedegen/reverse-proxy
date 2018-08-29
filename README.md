# Reverse proxy

## Description
This project consists of a reverse proxy written in Node.js, containing some basic features like HTTPS
support, auto-redirecting HTTP traffic, subdomain and error handling.

## Use case
I started this project because I've got plentiful small projects laying around of which some I'd
like to be accessible from the internet. As I've got just one domain name in my possession and since
I'm not planning to get one for each of my little experiments, I figured a reverse proxy might come
in handy. Especially because all these experiments run independently (as a separate process) on my Pi, each
having a port dedicated to them. By checking the incoming requests and where they're exactly headed
to, I can reach out to those underlying servers and pipe their response to the original request.

Why didn't I use [Nginx](https://nginx.org/) for this? Well, because I can. And because this way,
you learn a lot more when fiddling in the network corner of the IT landscape 🤓

## Configuration
A typical configuration file may look like the following:

```json
{
  "environment": "DEVELOPMENT",
  "logging": {
    "level": "info"
  },
  "certificate": {
    "crt": "./certs/certificate.crt",
    "key": "./certs/certificate.key"
  },
  "httpPort": 80,
  "httpsPort": 443,
  "hosts": {
    "productA": {
      "host": "product-a.xyz",
      "port": 9000,
      "subdomains": {
        "webshop": 9001
      }
    },
    "blog": {
      "host": "bloglife.abc",
      "port": 9100,
      "subdomains": {}
    }
  }
}
```

Please note that you still need to create two configuration files with all of the properties above,
matching the settings of the respective environment. The configuration file named `config.json` that
is present in the `config` folder can be used as a template. The format of the file name is
`config.<env>.json` and needs to be placed in the same folder. That `env` should either be `dev` or
`prd`. If more environments are required, you need to extend the code a bit 😊

### Environment
```json
"environment": "DEVELOPMENT"
```
As you can have multiple configuration files depending on the environment you're running in, you can
specify what environment this current configuration file applies to. By default, it's set to run in
`PRODUCTION` mode, but this can also be done by specifying any of the values (case-insensitive) below.
- `P`
- `PRD`
- `PROD`
- `PRODUCTION`

To run in `DEVELOPMENT` mode, specify any of these:
- `D`
- `DEV`
- `DEVELOPMENT`

### Logging
```json
"logging": {
  "level": "info"
}
```
You can also specify the level of logging. Following values (case-insensitive) are accepted:
- `ALL`
- `TRACE`
- `DEBUG`
- `INFO`
- `WARN`
- `ERROR`
- `FATAL`
- `OFF`

Note that these names are identical to the [supported names](https://log4js-node.github.io/log4js-node/api.html#configuration-object) of `log4js`. The log level defaults to `INFO`.

### Certificate (HTTPS)
```json
"certificate": {
  "crt": "./certs/certificate.crt",
  "key": "./certs/certificate.key"
}
```
In the `certificate` node, you have to specify the path to the HTTPS certifcate. A `.key` and a
`.crt` file is required to successfully spin up a HTTPS instance. If one of both files cannot be
found, an error will be thrown and the reverse proxy will not start up.

### Ports
```json
"httpPort": 80,
"httpsPort": 443
```
Whenever a request arrives at the specified HTTP port, it will get auto-redirected to the specified HTTPS port.
Further rules will only be applied to traffic destined for the HTTPS port.

### Hosts (rules)
```json
"hosts": {
  "productA": {
    "host": "product-a.xyz",
    "port": 9000,
    "subdomains": {
      "webshop": 9001
    }
  },
  "blog": {
    "host": "bloglife.abc",
    "port": 9100,
    "subdomains": {}
  }
}
```

This is the most important part of the configuration. In this example, two hosts, conveniently named
`productA` and `blog` are specified. Whenever traffic for `product-a.xyz` is encountered, it will
get its response from the server behind port `9000`. Unless the hostname also included a `webshop`
subdomain, then the request would get its response from port `9001`. The `blog` hostname has an
entirely different URL and no subdomains. Consequently, only hostnames that match `bloglife.abc`
will be served.

In case of a 404 (i.e. when the host in the request is unknown to the reverse proxy), a 502 (i.e.
when the underlying server is having problems) or a 504 (i.e. when the connection to the underlying
server times out), an error page will be shown. There's an error page per error and these can be
found under the `public` folder. Please note only HTTP 404, 502 and 504 errors are handled.

## Planned features
- HTTP/2 support, including push support.
- WebSocket support
