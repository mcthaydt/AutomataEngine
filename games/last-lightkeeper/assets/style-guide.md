# LAST LIGHTKEEPER Pixel Art Style Guide

## Canvas and pixel density

- Render at a 480x270 logical resolution with nearest-neighbor sampling.
- One source pixel equals one logical render pixel at 1x. Scale only by integer
  multiples; never smooth, blur, or resample at runtime.
- Keeper animation source frames are 96x96 with a 42-48 px standing silhouette;
  the larger transparent canvas is PixelLab V3's retained motion padding.
  Machinery and floor modules use 16 px increments and transparent padding.

## Palette and linework

- Core night: `#08111f`, `#10243a`, `#1c3b4f`, `#31576a`.
- Storm/sea: `#163146`, `#23536a`, `#39758a`, `#6d9aa3`.
- Stone/metal: `#27313a`, `#46515a`, `#6d7374`, `#a5a39a`.
- Warm light: `#e36f45`, `#f2a65a`, `#ffd27a`, `#fff1bd`.
- Alerts/effects: `#a8324a`, `#e25555`, `#79c6c8`, `#d7f4ef`.
- Use a one-pixel `#08111f` outer outline and selective interior outlines.
  Preserve readable silhouettes; avoid noisy single-pixel texture clusters.

## Lighting and composition

- Ambient storm light comes from the upper left in cool blue-green values.
- Beacon, lamps, sparks, and dawn are the only warm emitters. Warm light may
  break the dark outline on its lit edge but never erase the silhouette.
- All gameplay assets use a strict side view. Lighthouse modules align to the
  same cutaway plane; ships read as distinct silhouettes at 24-40 px tall.
- Damage states alter silhouette as well as color: bent parts, gaps, sparks,
  spray, or smoke must remain legible without HUD text.

## Animation

| Group | Frames | Frame duration | Loop |
| --- | ---: | ---: | --- |
| idle | 5 | 0.16 s | yes |
| run | 7 | 0.10 s | yes |
| climb | 5 | 0.12 s | yes |
| carry | 5 | 0.14 s | yes |
| operate-repair | 7 | 0.10 s | yes |

- Keep feet, hands, and carried-item anchors stable across frames.
- PixelLab V3 includes the reference pose as frame zero; it is retained so the
  checked frame sequence exactly matches the generated resource.
- Effects may use 4-8 frames at 0.06-0.10 s. No frame may extend outside its
  declared cell; transparent padding must be identical across a sheet.

## Transparency and files

- Characters, machinery, items, ships, and effects use straight-alpha PNGs
  with fully transparent backgrounds and no matte fringe.
- Full-frame sky/sea/dawn layers are opaque PNGs. Modular lighthouse layers
  remain transparent so damage and light overlays can stack.
- File names are lowercase kebab case: `<group>/<asset>-<state>.png` or
  `<group>/<asset>-<animation>.png`. Runtime paths are local to
  `public/assets`; remote URLs are prohibited.
- Every generated file records its PixelLab resource/job ID, prompt key,
  dimensions, frame geometry, animation/state tags, and final local path in
  `assets/manifest.json` and `assets/prompts.json`.
