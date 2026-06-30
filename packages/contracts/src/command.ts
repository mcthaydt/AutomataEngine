/**
 * Project command wire contract.
 *
 * Re-exporting preserves schema object and TypeScript type identity with the
 * dependency-light project package; contracts does not maintain a second copy.
 */
export {
  projectCommandSchema,
  projectTargetSchema,
  type ProjectCommand,
  type ProjectTarget
} from '@automata/project'
