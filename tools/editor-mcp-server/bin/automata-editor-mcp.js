#!/usr/bin/env node
import { tsImport } from 'tsx/esm/api'

await tsImport('../src/main.ts', import.meta.url)
