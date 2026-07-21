import { SaxesParser, type SaxesTagPlain } from 'saxes'

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'pattern', 'rect', 'circle', 'ellipse', 'polygon', 'path'
])

const ALLOWED_ATTRIBUTES = new Set([
  'xmlns', 'xmlns:xlink',
  'id', 'viewBox', 'preserveAspectRatio',
  'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'points', 'd',
  'patternUnits', 'patternTransform', 'transform',
  'fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap',
  'fill-opacity', 'stroke-opacity', 'opacity',
  'href', 'xlink:href'
])

const LOCAL_FRAGMENT = /^#[A-Za-z_][\w:.-]*$/
const LOCAL_PAINT = /^url\(#[A-Za-z_][\w:.-]*\)$/

/**
 * Parse one SVG document and enforce the asset pipeline's inert SVG subset.
 * An omitted palette skips only literal-color membership; markup and reference
 * safety are always enforced.
 */
export function validateSvgDocument(text: string, allowedColors?: readonly string[]): string[] {
  const errors: string[] = []
  const palette = allowedColors ? new Set(allowedColors) : null
  let rootSeen = false

  const parser = new SaxesParser({ xmlns: false })
  parser.on('xmldecl', () => { errors.push('XML declarations are not allowed') })
  parser.on('processinginstruction', () => { errors.push('processing instructions are not allowed') })
  parser.on('doctype', () => { errors.push('document type declarations are not allowed') })
  parser.on('cdata', () => { errors.push('CDATA sections are not allowed') })
  parser.on('text', (value) => {
    if (value.trim() !== '') errors.push('text nodes are not allowed')
  })
  parser.on('opentag', (tag: SaxesTagPlain) => {
    if (!rootSeen) {
      rootSeen = true
      if (tag.name !== 'svg') errors.push(`root element must be svg, got ${tag.name}`)
    }
    if (!ALLOWED_ELEMENTS.has(tag.name)) errors.push(`element ${tag.name} is not allowed`)

    for (const [name, value] of Object.entries(tag.attributes)) {
      const lower = name.toLowerCase()
      if (lower.startsWith('on')) {
        errors.push(`event handler attribute ${name} is not allowed`)
        continue
      }
      if (!ALLOWED_ATTRIBUTES.has(name)) {
        errors.push(`attribute ${name} is not allowed`)
        continue
      }
      if (name === 'xmlns' && value !== 'http://www.w3.org/2000/svg') {
        errors.push('xmlns must be the SVG namespace')
      }
      if (name === 'xmlns:xlink' && value !== 'http://www.w3.org/1999/xlink') {
        errors.push('xmlns:xlink must be the SVG xlink namespace')
      }
      if ((name === 'href' || name === 'xlink:href') && !LOCAL_FRAGMENT.test(value)) {
        errors.push(`${name} must reference a local fragment`)
      }
      if (name === 'fill' || name === 'stroke') {
        if (value === 'none' || LOCAL_PAINT.test(value)) continue
        if (/url\s*\(/i.test(value)) {
          errors.push(`${name} must not use an external URL`)
        } else if (palette && !palette.has(value)) {
          errors.push(`${name} uses off-palette color ${value}`)
        }
      } else if (/url\s*\(/i.test(value)) {
        errors.push(`${name} must not contain a URL`)
      }
    }
  })

  try {
    parser.write(text).close()
  } catch (error) {
    errors.push(`XML parse failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!rootSeen) errors.push('document has no root svg element')
  return [...new Set(errors)]
}
