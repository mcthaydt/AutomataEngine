import type { GameSpec } from '@automata/contracts'

/** Deterministic spec-to-markdown design brief for the human checkpoint. */
export function renderDesignBrief(spec: GameSpec): string {
  const lines: string[] = []
  const push = (line = ''): void => { lines.push(line) }
  push(`# ${spec.identity.title} — Design Brief`); push(); push(`> ${spec.identity.logline}`); push()
  push(`- **Game:** \`${spec.identity.id}\` · specVersion ${spec.specVersion} · rated ${spec.identity.contentRating}`)
  push(`- **Themes:** ${spec.identity.themes.join(', ')}`); push(`- **Prompt:** ${spec.provenance.prompt}`); push()
  push('## Direction'); push(); push(`- **Visual:** ${spec.direction.visualStyle}`); push(`- **Audio:** ${spec.direction.audioStyle}`); push(`- **Dialogue tone:** ${spec.direction.dialogueTone}`); push(`- **Camera:** ${spec.direction.camera}`); push()
  push('## Supported translations'); push()
  if (spec.provenance.translations.length === 0) push('No unsupported requests were translated.')
  else for (const item of spec.provenance.translations) push(`- Requested **${item.requested}** → **${item.translatedTo}** (${item.reason})`)
  push(); push('## World'); push(); for (const item of spec.world.locations) push(`- **${item.name}** (${item.kind}): ${item.description}`)
  push(); push('## Cast'); push(); for (const item of spec.cast) push(`- **${item.name}** (${item.role}): ${item.description}`)
  push(); push('## Story outline'); push(); push(spec.story.premise); push(); for (const item of spec.story.beats) push(`1. *${item.kind}* — ${item.summary}`)
  push(); push('## Capabilities'); push(); for (const item of spec.capabilities) push(`- \`${item.id}\`${item.requirements.length ? ` — needs: ${item.requirements.join('; ')}` : ''}`)
  push(); push('## Budgets'); push(); for (const [key, value] of Object.entries(spec.budgets)) push(`- ${key}: ${value}`)
  push(); push('## Progression'); push(); for (const item of spec.progression.milestones) push(`1. ${item.summary}`)
  push(); push('## Asset requirements'); push(); for (const item of spec.assets) push(`- \`${item.id}\` (${item.kind}): ${item.description}`)
  push(); push('## Acceptance criteria'); push(); for (const item of spec.acceptance) push(`- [${item.kind}] ${item.description} → \`${item.target}\``)
  push(); push('## Version history'); push(); for (const item of spec.provenance.history) push(`- v${item.version}: ${item.reason}`)
  push()
  return lines.join('\n')
}
