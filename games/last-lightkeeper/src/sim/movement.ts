import type { InputVector } from '@automata/engine'
import { nightDefinition } from '../data/night'
import type { FloorId, NightDefinition } from '../data/schema'
import type { KeeperMode, KeeperState } from '../state/night'

export const KEEPER_MOVE_SPEED = 48
export const KEEPER_CLIMB_SPEED = 36
export const LADDER_ENTER_DISTANCE = 6

export interface MovementIntents {
  movement: InputVector
  operate: boolean
}

export interface MovementContext {
  playing: boolean
  definition?: NightDefinition
}

function floorById(definition: NightDefinition, id: FloorId) {
  return definition.floors.find((floor) => floor.id === id)!
}

function connectedFloor(
  definition: NightDefinition,
  floor: FloorId,
  ladder: NightDefinition['ladders'][number]
): FloorId {
  return ladder.from === floor ? ladder.to : ladder.from
}

function restingMode(keeper: KeeperState, intents: MovementIntents): KeeperMode {
  if (intents.operate) return 'operate'
  return keeper.carriedItem === null ? 'idle' : 'carry'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function moveOnLadder(
  keeper: KeeperState,
  intents: MovementIntents,
  dt: number,
  definition: NightDefinition
): KeeperState | null {
  const vertical = clamp(intents.movement.y, -1, 1)
  const originFloor = floorById(definition, keeper.floor)
  const betweenFloors = Math.abs(keeper.y - originFloor.y) > Number.EPSILON
  const ladder = definition.ladders.find((candidate) => {
    if (candidate.from !== keeper.floor && candidate.to !== keeper.floor) return false
    const other = floorById(definition, connectedFloor(definition, keeper.floor, candidate))
    const minY = Math.min(originFloor.y, other.y)
    const maxY = Math.max(originFloor.y, other.y)
    const withinSpan = keeper.y >= minY && keeper.y <= maxY
    return withinSpan && (betweenFloors
      ? Math.abs(keeper.x - candidate.x) <= Number.EPSILON
      : Math.abs(keeper.x - candidate.x) <= LADDER_ENTER_DISTANCE)
  })

  if (ladder === undefined) return null
  if (vertical === 0) return betweenFloors ? { ...keeper, mode: 'climb' } : null

  const otherId = connectedFloor(definition, keeper.floor, ladder)
  const otherFloor = floorById(definition, otherId)
  const travelY = clamp(
    keeper.y + vertical * KEEPER_CLIMB_SPEED * dt,
    Math.min(originFloor.y, otherFloor.y),
    Math.max(originFloor.y, otherFloor.y)
  )
  const movingTowardOther = Math.sign(vertical) === Math.sign(otherFloor.y - originFloor.y)
  const destination = movingTowardOther ? otherFloor : originFloor
  const reachedDestination = travelY === destination.y

  return {
    ...keeper,
    floor: reachedDestination && movingTowardOther ? otherId : keeper.floor,
    x: ladder.x,
    y: travelY,
    mode: reachedDestination ? restingMode(keeper, intents) : 'climb'
  }
}

export function moveKeeper(
  keeper: KeeperState,
  intents: MovementIntents,
  dt: number,
  context: MovementContext
): KeeperState {
  if (!context.playing || !Number.isFinite(dt) || dt <= 0) return keeper

  const definition = context.definition ?? nightDefinition
  const ladderMove = moveOnLadder(keeper, intents, dt, definition)
  if (ladderMove !== null) return ladderMove

  const floor = floorById(definition, keeper.floor)
  const horizontal = clamp(intents.movement.x, -1, 1)
  const x = clamp(keeper.x + horizontal * KEEPER_MOVE_SPEED * dt, floor.xMin, floor.xMax)
  const moving = x !== keeper.x
  const mode: KeeperMode = moving
    ? (keeper.carriedItem === null ? 'run' : 'carry')
    : restingMode(keeper, intents)

  return {
    ...keeper,
    x,
    y: floor.y,
    mode,
    facing: horizontal === 0 ? keeper.facing : horizontal < 0 ? -1 : 1
  }
}
