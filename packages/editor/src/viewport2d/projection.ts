import type { Vec3 } from '@automata/engine'

export interface MapView { panX: number; panZ: number; pixelsPerUnit: number }
export interface ScreenSize { w: number; h: number }

export const initialMapView: MapView = { panX: 0, panZ: 0, pixelsPerUnit: 24 }

export function worldToScreen(view: MapView, world: Vec3, size: ScreenSize): { x: number; y: number } {
  return {
    x: size.w / 2 + (world.x - view.panX) * view.pixelsPerUnit,
    y: size.h / 2 + (world.z - view.panZ) * view.pixelsPerUnit
  }
}

export function screenToWorldXZ(
  view: MapView,
  screen: { x: number; y: number },
  size: ScreenSize
): { x: number; z: number } {
  return {
    x: (screen.x - size.w / 2) / view.pixelsPerUnit + view.panX,
    z: (screen.y - size.h / 2) / view.pixelsPerUnit + view.panZ
  }
}
