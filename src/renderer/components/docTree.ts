import type { LibraryEntry } from '../../core/library/types'

export interface TreeNode { name: string; ref?: string; children: TreeNode[] }

export function buildDocTree(entries: LibraryEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', children: [] }
  for (const e of entries) {
    const parts = e.ref.split('/')
    let node = root
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1
      let child = node.children.find((c) => c.name === part && (isFile ? c.ref !== undefined : c.ref === undefined))
      if (!child) { child = { name: part, children: [], ...(isFile ? { ref: e.ref } : {}) }; node.children.push(child) }
      node = child
    })
  }
  const sortRec = (n: TreeNode): void => {
    n.children.sort((a, b) => {
      const af = a.ref === undefined, bf = b.ref === undefined
      if (af !== bf) return af ? -1 : 1 // folders first
      return a.name.localeCompare(b.name)
    })
    n.children.forEach(sortRec)
  }
  sortRec(root)
  return root.children
}
