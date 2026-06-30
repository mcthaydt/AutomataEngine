import { describe, expect, it } from 'vitest'
import {
  projectCommandSchema as contractProjectCommandSchema,
  type ProjectCommand as ContractProjectCommand
} from '../src/projectCommand'
import {
  projectCommandSchema as sourceProjectCommandSchema,
  type ProjectCommand as SourceProjectCommand
} from '@automata/project'

describe('project command contract', () => {
  it('re-exports the project package schema by identity', () => {
    expect(contractProjectCommandSchema).toBe(sourceProjectCommandSchema)
  })

  it('keeps the command type assignable in both directions', () => {
    const source: SourceProjectCommand = {
      type: 'removeEntities', sceneId: 'main', entityIds: ['box']
    }
    const contract: ContractProjectCommand = source
    const roundTrip: SourceProjectCommand = contract
    expect(roundTrip).toEqual(source)
  })
})
