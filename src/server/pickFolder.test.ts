// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { folderPickerCommand, parseFolderPickerOutput } from './pickFolder'

describe('folderPickerCommand', () => {
  it('uses osascript with a "choose folder" AppleScript on darwin', () => {
    const { cmd, args } = folderPickerCommand('darwin')
    expect(cmd).toBe('osascript')
    expect(args[0]).toBe('-e')
    expect(args[1]).toContain('choose folder')
    expect(args[1]).toContain('POSIX path')
  })

  it('uses PowerShell FolderBrowserDialog on win32', () => {
    const { cmd, args } = folderPickerCommand('win32')
    expect(cmd).toBe('powershell.exe')
    expect(args).toContain('-STA')
    expect(args[args.length - 1]).toContain('FolderBrowserDialog')
  })

  it('uses zenity directory selection on linux', () => {
    const { cmd, args } = folderPickerCommand('linux')
    expect(cmd).toBe('zenity')
    expect(args).toContain('--file-selection')
    expect(args).toContain('--directory')
  })
})

describe('parseFolderPickerOutput', () => {
  it('returns null for empty output (cancelled)', () => {
    expect(parseFolderPickerOutput('darwin', '')).toBeNull()
    expect(parseFolderPickerOutput('darwin', '   \n')).toBeNull()
    expect(parseFolderPickerOutput('win32', '')).toBeNull()
  })

  it('trims and returns the Windows path verbatim', () => {
    expect(parseFolderPickerOutput('win32', 'C:\\Books')).toBe('C:\\Books')
    expect(parseFolderPickerOutput('win32', 'C:\\Books\n')).toBe('C:\\Books')
  })

  it('strips the trailing slash from a POSIX path on darwin/linux', () => {
    // osascript "POSIX path of ..." yields a trailing slash for folders
    expect(parseFolderPickerOutput('darwin', '/Library/Books/\n')).toBe('/Library/Books')
    expect(parseFolderPickerOutput('linux', '/srv/readbetter-books/')).toBe('/srv/readbetter-books')
  })

  it('preserves the filesystem root', () => {
    expect(parseFolderPickerOutput('darwin', '/')).toBe('/')
  })
})
