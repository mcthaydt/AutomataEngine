import type { AssetKind, AssetProvider } from '@automata/contracts'
import { audioProvider } from './audioProvider'
import { propProvider } from './propProvider'
import { svgProvider } from './svgProvider'

/** The only module that knows the complete procedural-provider set. */
export const ASSET_PROVIDERS: Record<string, AssetProvider> = {
  [svgProvider.id]: svgProvider,
  [propProvider.id]: propProvider,
  [audioProvider.id]: audioProvider
}

export function resolveProvider(kind: AssetKind): AssetProvider {
  const provider = Object.values(ASSET_PROVIDERS)
    .find((entry) => entry.kinds.includes(kind))
  if (!provider) throw new Error(`No asset provider registered for kind "${kind}"`)
  return provider
}
