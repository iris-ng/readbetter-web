import { spawn } from 'child_process'

const WIN_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
  "$d.Description = 'Select a folder to add as a readbetter project'",
  '$d.ShowNewFolderButton = $false',
  "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }"
].join('; ')

// AppleScript: "choose folder" opens the native Finder picker; "POSIX path of" yields an absolute
// path (with a trailing slash). Cancelling raises error -128, so osascript exits non-zero with no
// stdout — which parseFolderPickerOutput maps to null.
const MAC_SCRIPT =
  'POSIX path of (choose folder with prompt "Select a folder to add as a readbetter project")'

/** The native folder-picker command for a platform, as an executable + args (no shell).
 *  Mirrors openBrowser.ts's browserCommand pattern so it can be unit-tested without spawning. */
export function folderPickerCommand(platform: NodeJS.Platform): { cmd: string; args: string[] } {
  if (platform === 'win32') return { cmd: 'powershell.exe', args: ['-NoProfile', '-STA', '-Command', WIN_SCRIPT] }
  if (platform === 'darwin') return { cmd: 'osascript', args: ['-e', MAC_SCRIPT] }
  // Linux/other: zenity is the common GTK dialog; best-effort (resolves null if absent).
  return {
    cmd: 'zenity',
    args: ['--file-selection', '--directory', '--title=Select a folder to add as a readbetter project']
  }
}

/** Normalise a picker's stdout into an absolute path, or null when nothing was chosen.
 *  Windows returns a bare path; the POSIX pickers (osascript/zenity) append a trailing slash,
 *  which we strip so paths compare equal to the Windows form (but the root "/" is preserved). */
export function parseFolderPickerOutput(platform: NodeJS.Platform, stdout: string): string | null {
  const path = stdout.trim()
  if (path === '') return null
  if (platform === 'win32') return path
  return path.length > 1 && path.endsWith('/') ? path.replace(/\/+$/, '') : path
}

/** Open the native folder picker for the host OS; resolve the chosen absolute path, or null if
 *  cancelled or unavailable. macOS uses osascript, Windows PowerShell, Linux zenity. */
export function pickFolder(platform: NodeJS.Platform = process.platform): Promise<string | null> {
  return new Promise((resolve) => {
    const { cmd, args } = folderPickerCommand(platform)
    let out = ''
    try {
      const child = spawn(cmd, args)
      child.stdout.on('data', (d) => { out += d.toString() })
      // A missing picker binary (e.g. zenity not installed) is not fatal: resolve null.
      child.on('error', () => resolve(null))
      child.on('close', () => resolve(parseFolderPickerOutput(platform, out)))
    } catch {
      resolve(null)
    }
  })
}
