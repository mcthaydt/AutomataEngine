/** A 2D control vector; |v| <= 1. x = right, y = forward. */
export interface InputVector { x: number; y: number }

export interface InputSource {
  read(): InputVector
  dispose(): void
}
