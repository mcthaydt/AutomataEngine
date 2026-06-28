import type { ValidationIssue } from '@automata/project'
import type { ProjectEditorAction } from '../../project/actions'
import type { ProjectSelection } from '../../project/selection'
import type { ProjectEditorState } from '../../project/store'

/**
 * Validation panel: runs the shared layered validator and lists each issue with
 * its severity/code/message. Clicking an issue selects its typed location so the
 * inspector focuses the offending document.
 */
export interface ProjectValidationOptions {
  dispatch: (action: ProjectEditorAction) => void
}

export interface ProjectValidationHandle {
  update(state: ProjectEditorState): void
  dispose(): void
}

export function mountProjectValidation(parent: HTMLElement, options: ProjectValidationOptions): ProjectValidationHandle {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-validation'
  root.dataset.projectValidation = ''
  parent.append(root)
  return {
    update(state) { render(root, state, options) },
    dispose() { root.remove() }
  }
}

function render(root: HTMLElement, state: ProjectEditorState, options: ProjectValidationOptions): void {
  root.replaceChildren()
  const issues = state.registration.validate(state.snapshot)
  const head = document.createElement('div')
  head.className = 'ed-panel-head'
  head.textContent = `Validation (${issues.length})`
  root.append(head)

  if (issues.length === 0) {
    const ok = document.createElement('p')
    ok.className = 'ed-hint'
    ok.textContent = 'No problems.'
    root.append(ok)
    return
  }

  for (const issue of issues) {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = `ed-issue ed-issue-${issue.severity}`
    row.dataset.issue = issue.code
    row.dataset.severity = issue.severity
    row.textContent = `${issue.code}: ${issue.message}`
    row.addEventListener('click', () => options.dispatch({ type: 'select', selection: selectionForIssue(issue) }))
    root.append(row)
  }
}

function selectionForIssue(issue: ValidationIssue): ProjectSelection {
  if (issue.componentId && issue.sceneId && issue.entityId) return { kind: 'component', sceneId: issue.sceneId, entityId: issue.entityId, componentId: issue.componentId }
  if (issue.entityId && issue.sceneId) return { kind: 'entity', sceneId: issue.sceneId, entityIds: [issue.entityId] }
  if (issue.resourceId) return { kind: 'resource', resourceId: issue.resourceId }
  if (issue.sceneId) return { kind: 'scene', sceneId: issue.sceneId }
  return { kind: 'project' }
}
