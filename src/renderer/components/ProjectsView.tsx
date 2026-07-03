import type { JSX } from 'react'
import type { ProjectInfo } from '../../core/library/types'
import { Icon } from './Icon'

export function ProjectsView(props: {
  projects: ProjectInfo[]
  onOpen: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onLocate: (id: string) => void
}): JSX.Element {
  return (
    <div className="projects-view">
      <header>
        <span className="wordmark">
          read·<b>better</b>
        </span>
      </header>
      {props.projects.length === 0 && <p className="empty">No projects yet. Add a folder to begin.</p>}
      <ul className="project-cards">
        {props.projects.map((p) => {
          const count = p.missing
            ? 'Folder missing'
            : `${p.docCount} ${p.docCount === 1 ? 'document' : 'documents'}`
          return (
            <li key={p.id} className={`project-card${p.missing ? ' missing' : ''}`}>
              <button
                className="open"
                disabled={p.missing}
                onClick={() => {
                  if (!p.missing) props.onOpen(p.id)
                }}
              >
                <span className="monogram" aria-hidden>
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <span className="name">{p.name}</span>
                <span className="count">{count}</span>
              </button>
              {p.missing && (
                <button className="locate" onClick={() => props.onLocate(p.id)}>
                  Locate...
                </button>
              )}
              <button className="remove" aria-label={`Forget ${p.name} registration`} title="Forget project; files and readbetter data stay on disk" onClick={() => props.onRemove(p.id)}>
                <Icon name="trash" size={16} />
              </button>
            </li>
          )
        })}
        <li className="project-card">
          <button className="add" onClick={props.onAdd}>
            <span aria-hidden>+</span> Add folder
          </button>
        </li>
      </ul>
    </div>
  )
}
