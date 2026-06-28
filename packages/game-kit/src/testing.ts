import {
  createNullAudio, createNullRenderer,
  type InputSource, type InputVector, type NullAudio, type NullRenderer
} from '@automata/engine'

/** A fixed-vector input source for deterministic gameplay tests. */
export function stick(v: InputVector = { x: 0, y: 0 }): InputSource {
  return { read: () => v, dispose() {} }
}

/** Recording render + audio doubles bundled for headless gameplay tests. */
export function nullRuntime(): { render: NullRenderer; audio: NullAudio } {
  return { render: createNullRenderer(), audio: createNullAudio() }
}
