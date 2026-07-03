import { spawn } from 'child_process'

export function browserCommand(
  url: string,
  platform: NodeJS.Platform
): { cmd: string; args: string[] } {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] }
  if (platform === 'darwin') return { cmd: 'open', args: [url] }
  return { cmd: 'xdg-open', args: [url] }
}

export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const { cmd, args } = browserCommand(url, platform)
  // No shell: cmd/open/xdg-open are real executables, so passing an args array is safe and
  // avoids Node's DEP0190 warning (args aren't shell-escaped when shell:true).
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {
    /* opening a browser is best-effort; never crash the server over it */
  })
  child.unref()
}
