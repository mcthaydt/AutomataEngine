export const THEME_STYLE_ID = 'editor-slate-pro'

export const SLATE_PRO_CSS = `
.ed-root {
  --bg: #11151d; --panel: #1a202c; --panel-2: #222a3a; --edge: #0d1019;
  --bevel: #36425c; --ink: #cdd6e6; --ink-dim: #8b96b0; --accent: #e0a83e; --ok: #7ed957; --bad: #ff7a7a;
  position: fixed; inset: 0; display: grid; grid-template-rows: auto 1fr auto;
  background: var(--bg); color: var(--ink);
  font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  user-select: none;
}
.ed-root button { font: inherit; color: var(--ink); cursor: pointer; }
.ed-menubar-host { display: flex; align-items: center; gap: 8px; background: #1e2433; box-shadow: inset 0 1px 0 var(--bevel); z-index: 5; }
.ed-menubar { display: flex; gap: 2px; align-items: stretch; padding: 2px 6px;
  background: #1e2433; box-shadow: inset 0 1px 0 var(--bevel); z-index: 5; }
.ed-toolbar-host { margin-left: auto; padding-right: 8px; }
.ed-toolbar { display: flex; align-items: center; gap: 4px; }
.ed-toolbar .ed-tool { min-width: 56px; justify-content: center; padding: 4px 8px; }
.ed-toolbar-status { min-width: 130px; max-width: 260px; color: var(--ink-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ed-menu { position: relative; }
.ed-menu-title { background: transparent; border: 1px solid transparent; border-radius: 4px; padding: 4px 10px; }
.ed-menu-title:hover { background: var(--panel-2); }
.ed-menu-drop { position: absolute; top: 100%; left: 0; min-width: 190px; display: none;
  flex-direction: column; padding: 4px; gap: 1px; background: var(--panel);
  border: 1px solid var(--edge); border-radius: 6px; box-shadow: 0 12px 28px rgba(0,0,0,.5); z-index: 6; }
.ed-menu.is-open .ed-menu-drop { display: flex; }
.ed-menu-item { display: flex; justify-content: space-between; gap: 24px; background: transparent;
  border: 0; border-radius: 4px; padding: 5px 8px; text-align: left; }
.ed-menu-item:hover:not(:disabled) { background: var(--panel-2); }
.ed-menu-item:disabled { color: #54607a; cursor: default; }
.ed-menu-sc { color: var(--ink-dim); }

.ed-body { display: flex; min-height: 0; }
.ed-palette-host { width: 132px; display: flex; flex-direction: column; gap: 6px; padding: 8px;
  background: var(--panel); box-shadow: inset -1px 0 0 #2a3346; overflow: auto; }
.ed-palette { display: flex; flex-direction: column; gap: 4px; }
.ed-group-label { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-dim); margin-top: 4px; }
.ed-tool { display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 6px 8px; background: var(--panel-2); border: 1px solid #2f394e; border-radius: 5px;
  box-shadow: inset 0 1px 0 var(--bevel); }
.ed-tool.is-active { background: var(--accent); color: #1a130a; border-color: #f3c25e;
  box-shadow: 0 0 8px rgba(224,168,62,.5); }

.ed-viewport { position: relative; flex: 1; min-width: 0; background: #0b0e15; }
.ed-vp-main { position: absolute; inset: 0; }
.ed-vp-inset { position: absolute; right: 10px; bottom: 10px; width: 30%; height: 34%;
  border: 1px solid #2a3346; border-radius: 6px; overflow: hidden; box-shadow: 0 8px 22px rgba(0,0,0,.55); }
.ed-vp-inset.is-hidden { display: none; }
.ed-vp-canvas { display: block; width: 100%; height: 100%; }
.ed-vp-swap, .ed-vp-hide { position: absolute; top: 4px; width: 22px; height: 22px; padding: 0;
  background: rgba(11,14,21,.85); border: 1px solid #2a3346; border-radius: 4px; z-index: 2; }
.ed-vp-swap { right: 30px; } .ed-vp-hide { right: 4px; }

.ed-rightcol { width: 230px; display: flex; flex-direction: column; gap: 8px; padding: 8px;
  background: var(--panel); box-shadow: inset 1px 0 0 #2a3346; overflow: auto; }
.ed-panel { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 6px; overflow: hidden; }
.ed-panel-head { font-size: 9px; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-dim);
  padding: 6px 8px; background: #1f2738; border-bottom: 1px solid var(--edge); }
.ed-field-group { display: flex; flex-direction: column; }
.ed-field { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 6px; padding: 3px 8px; }
.ed-field-label { color: var(--accent); font-weight: 600; }
.ed-field-num { width: 100%; min-width: 0; box-sizing: border-box; padding: 3px 5px;
  background: #11151d; color: var(--ink); border: 1px solid #3a455f; border-radius: 4px;
  font-variant-numeric: tabular-nums; }
.ed-stepper { display: flex; flex-direction: column; }
.ed-stepper button { line-height: 1; padding: 0 4px; background: #11151d; border: 1px solid #3a455f; border-radius: 3px; font-size: 8px; }
.ed-hint { color: var(--ink-dim); padding: 6px 8px; font-style: italic; }

.ed-outliner .ed-item-list { display: flex; flex-direction: column; }
.ed-item { display: flex; align-items: center; justify-content: space-between; padding: 2px 6px; }
.ed-item.is-selected { background: #243049; }
.ed-item-label { flex: 1; text-align: left; background: transparent; border: 0; padding: 3px 2px; }
.ed-item-del { background: transparent; border: 0; opacity: .6; }
.ed-item-del:hover { opacity: 1; }
.ed-warn { color: var(--accent); padding: 5px 8px; font-size: 11px; }

.ed-statusbar { display: flex; align-items: center; gap: 14px; padding: 4px 10px;
  background: #1e2433; color: var(--ink-dim); box-shadow: inset 0 1px 0 var(--bevel); }
.ed-status-cell { font-variant-numeric: tabular-nums; }
.ed-snap { background: var(--panel-2); border: 1px solid #2f394e; border-radius: 4px; padding: 2px 8px; }
.ed-status-valid.is-invalid { color: var(--bad); } .ed-status-valid:not(.is-invalid) { color: var(--ok); }
.ed-status-tool { margin-left: auto; }
`

/** Injects the Slate Pro stylesheet once; only the creating call removes it. */
export function injectTheme(doc: Document = document): () => void {
  if (doc.getElementById(THEME_STYLE_ID)) return () => {}
  const style = doc.createElement('style')
  style.id = THEME_STYLE_ID
  style.textContent = SLATE_PRO_CSS
  doc.head.append(style)
  return () => { style.remove() }
}
