import { z } from '@automata/engine'

export const floorIdSchema = z.enum(['lantern', 'navigation', 'quarters', 'workshop', 'machinery'])
export const circuitIdSchema = z.enum(['beacon', 'radio', 'bilge', 'workshop'])
export const stationIdSchema = z.enum([
  'beacon', 'radio', 'chart', 'breaker', 'workbench', 'generator', 'pump'
])
export const itemIdSchema = z.enum(['wrench', 'fuse', 'pump-handle', 'boards', 'coolant'])

const positionedSchema = z.object({ floor: floorIdSchema, x: z.number().finite() })

const floorSchema = z.object({
  id: floorIdSchema,
  name: z.string().min(1),
  y: z.number().finite(),
  xMin: z.number().finite(),
  xMax: z.number().finite()
}).refine((floor) => floor.xMin < floor.xMax, 'Floor xMin must be below xMax')

const ladderSchema = z.object({
  id: z.string().min(1),
  from: floorIdSchema,
  to: floorIdSchema,
  x: z.number().finite()
})

const stationSchema = positionedSchema.extend({
  id: stationIdSchema,
  label: z.string().min(1),
  circuit: circuitIdSchema.optional()
})

const itemSchema = positionedSchema.extend({
  id: itemIdSchema,
  label: z.string().min(1),
  reusable: z.boolean()
})

const callSchema = z.object({
  id: z.string().min(1),
  shipName: z.string().min(1),
  shipVisual: z.string().min(1),
  arrivalS: z.number().nonnegative(),
  bearingDeg: z.number().min(-90).max(90),
  identifyS: z.number().positive(),
  windowStartS: z.number().nonnegative(),
  windowEndS: z.number().positive(),
  holdS: z.number().positive(),
  danger: z.string().min(1)
}).superRefine((call, context) => {
  if (!(call.arrivalS < call.windowStartS && call.windowStartS < call.windowEndS)) {
    context.addIssue({ code: 'custom', message: 'Call rescue window must follow arrival' })
  }
  if (call.windowEndS > 780) {
    context.addIssue({ code: 'custom', message: 'Call rescue window exceeds the night' })
  }
})

const phaseSchema = z.object({
  id: z.enum(['first-signal', 'rising-storm', 'severe-weather', 'blackout-crisis', 'dawn']),
  startS: z.number().nonnegative(),
  endS: z.number().positive(),
  eventBudget: z.number().int().nonnegative(),
  severity: z.number().min(0).max(1)
}).refine((phase) => phase.startS < phase.endS, 'Phase must have positive duration')

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length
}

export const nightDefinitionSchema = z.object({
  version: z.literal(1),
  floors: z.array(floorSchema).length(5, 'Night must define five floors'),
  ladders: z.array(ladderSchema).length(4),
  stations: z.array(stationSchema).length(7),
  circuits: z.tuple([
    z.literal('beacon'), z.literal('radio'), z.literal('bilge'), z.literal('workshop')
  ]),
  items: z.array(itemSchema).length(5),
  calls: z.array(callSchema).min(3),
  phases: z.array(phaseSchema).length(5),
  rules: z.object({
    durationS: z.literal(780),
    defaultCapacity: z.literal(3),
    maxDarkS: z.number().positive(),
    rescueTarget: z.number().int().positive()
  }),
  score: z.object({
    rescue: z.number().int().nonnegative(),
    integrity: z.number().nonnegative(),
    outagePenalty: z.number().nonnegative(),
    efficiency: z.number().nonnegative()
  })
}).superRefine((night, context) => {
  if (!unique(night.floors.map((floor) => floor.id))) {
    context.addIssue({ code: 'custom', message: 'Floor ids must be unique' })
  }
  if (!unique(night.stations.map((station) => station.id))) {
    context.addIssue({ code: 'custom', message: 'Station ids must be unique' })
  }
  if (!unique(night.items.map((item) => item.id))) {
    context.addIssue({ code: 'custom', message: 'Item ids must be unique' })
  }
  if (!unique(night.calls.map((call) => call.id))) {
    context.addIssue({ code: 'custom', message: 'Call ids must be unique' })
  }
  for (let index = 1; index < night.phases.length; index++) {
    if (night.phases[index]!.startS !== night.phases[index - 1]!.endS) {
      context.addIssue({ code: 'custom', message: 'Night phases must be contiguous' })
    }
  }
  if (night.phases[0]?.startS !== 0 || night.phases.at(-1)?.endS !== night.rules.durationS) {
    context.addIssue({ code: 'custom', message: 'Night phases must span the full duration' })
  }
})

export type FloorId = z.infer<typeof floorIdSchema>
export type CircuitId = z.infer<typeof circuitIdSchema>
export type StationId = z.infer<typeof stationIdSchema>
export type ItemId = z.infer<typeof itemIdSchema>
export type NightDefinition = z.infer<typeof nightDefinitionSchema>

export function parseNightDefinition(input: unknown): NightDefinition {
  return nightDefinitionSchema.parse(input)
}
