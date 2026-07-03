import { Server } from 'http'

/**
 * Bind the server to 127.0.0.1 on `preferredPort`. If that port is in use,
 * fall back to an ephemeral port (0). Resolves with the actual bound port.
 */
export function listenLoopback(server: Server, preferredPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      if (err.code === 'EADDRINUSE' && preferredPort !== 0) {
        server.removeListener('error', onError)
        const onFallbackError = (e: NodeJS.ErrnoException): void => reject(e)
        server.listen(0, '127.0.0.1', () => {
          server.removeListener('error', onFallbackError)
          resolve(actualPort(server))
        })
        server.once('error', onFallbackError)
      } else {
        reject(err)
      }
    }
    server.once('error', onError)
    server.listen(preferredPort, '127.0.0.1', () => {
      server.removeListener('error', onError)
      resolve(actualPort(server))
    })
  })
}

function actualPort(server: Server): number {
  const addr = server.address()
  return typeof addr === 'object' && addr ? addr.port : 0
}
