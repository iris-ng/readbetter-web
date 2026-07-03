// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { browserCommand } from './openBrowser'

describe('browserCommand', () => {
  it('uses cmd /c start on win32', () => {
    const { cmd, args } = browserCommand('http://127.0.0.1:7777', 'win32')
    expect(cmd).toBe('cmd')
    expect(args).toEqual(['/c', 'start', '', 'http://127.0.0.1:7777'])
  })
  it('uses open on darwin', () => {
    expect(browserCommand('http://x', 'darwin')).toEqual({ cmd: 'open', args: ['http://x'] })
  })
  it('uses xdg-open elsewhere', () => {
    expect(browserCommand('http://x', 'linux')).toEqual({ cmd: 'xdg-open', args: ['http://x'] })
  })
})
