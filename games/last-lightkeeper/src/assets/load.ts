import { parseAssetManifest, type AssetEntry, type AssetManifest } from './schema'

export interface ImageDimensions { width: number; height: number }
export interface AssetCatalog {
  manifest: AssetManifest
  byId: ReadonlyMap<string, AssetEntry>
  byFile: ReadonlyMap<string, AssetEntry>
}

export class AssetLoadError extends Error {
  override readonly name = 'AssetLoadError'
}

export function createAssetCatalog(
  input: unknown,
  images: ReadonlyMap<string, ImageDimensions>
): AssetCatalog {
  const manifest = parseAssetManifest(input)
  const missing = manifest.assets.filter((asset) => !images.has(asset.file)).map((asset) => asset.file)
  if (missing.length > 0) {
    throw new AssetLoadError(`Missing asset files: ${missing.join(', ')}`)
  }
  for (const asset of manifest.assets) {
    const decoded = images.get(asset.file)!
    if (decoded.width !== asset.width || decoded.height !== asset.height) {
      throw new AssetLoadError(
        `Asset ${asset.id} decoded at ${decoded.width}x${decoded.height}; manifest declares ${asset.width}x${asset.height}`
      )
    }
  }
  return {
    manifest,
    byId: new Map(manifest.assets.map((asset) => [asset.id, asset])),
    byFile: new Map(manifest.assets.map((asset) => [asset.file, asset]))
  }
}
