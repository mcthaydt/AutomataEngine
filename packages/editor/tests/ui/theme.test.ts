import { describe, expect, it } from 'vitest'
import { THEME_STYLE_ID, injectTheme } from '../../src/ui/theme.css'

describe('Slate Pro theme', () => {
  it('injects one stylesheet and removes it on dispose', () => {
    const dispose = injectTheme(document)
    expect(document.getElementById(THEME_STYLE_ID)).not.toBeNull()
    const second = injectTheme(document)
    expect(document.querySelectorAll(`#${THEME_STYLE_ID}`)).toHaveLength(1)
    second() // no-op: did not create the element
    expect(document.getElementById(THEME_STYLE_ID)).not.toBeNull()
    dispose()
    expect(document.getElementById(THEME_STYLE_ID)).toBeNull()
  })
})
