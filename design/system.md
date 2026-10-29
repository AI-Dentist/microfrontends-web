# Clinical design system: source reference and prototype contract

This sync records existing CSS, not a unified production system. The next staff-only, single-clinic ERP prototype should use the **proposed light semantic mapping** below. No application CSS was changed. [Open the static reference board](system.html); it is not a runnable ERP or a build-tested implementation.

## Quick path

1. Use clinical tokens from source **T** and font stacks from **I**.
2. Apply the explicitly proposed semantic mapping and accessibility corrections below.
3. Use source component dimensions and the sourced spacing scale. Do not inherit template violet or shell chrome colors.

## Source authority

| Key | Exact source path | Authority |
| --- | --- | --- |
| T | `apps/mf3-react-henry/src/styles/theme.css` | Canonical clinical colors, semantic aliases, radii, shadows; light and auto-dark values |
| I | `apps/mf3-react-henry/src/index.css` | Font stacks and template typography; violet/template tokens are separate, not clinical authority |
| C | `apps/mf3-react-henry/src/styles/components.css` | Actual clinical layout, spacing, sizes and component behavior |
| S | `apps/shell/src/styles.css` | Current shell chrome discrepancies, not the clinical palette |

Every T/I/C/S reference below names the exact path in this table. Generated `dist-remote/remote.css` is not an independent authority and was not used. No unrelated clinical code was read.

## Inventory counts

Counts distinguish declarations from unique values and light defaults from overrides.

| Group | Count | Source |
| --- | ---: | --- |
| Clinical light color declarations | 31 (26 unique colors; aliases included) | T |
| Clinical dark color overrides | 9 (no additional unique colors) | T |
| Clinical radius tokens | 3 | T |
| Clinical shadow tokens | 3 | T |
| Template light color declarations | 9 (includes alpha colors) | I |
| Template dark color overrides | 9 | I |
| Template shadow declarations | 1 light + 1 dark override | I |
| Font-family tokens | 3 names, 2 unique stacks | I |
| Selected clinical spacing values | 13, including zero | C |
| Reference type sizes | 13 unique sizes | C + I |
| Reference radius values | 6, including code and badge/circle rules | T + I + C |
| Proposed semantic roles | 11, all reuse existing values | T |

### Clinical color tokens (light)

All entries in this table come from **T**.

| Token | Value | Source usage |
| --- | --- | --- |
| `--primary` | `#0284c7` | Default action, active tab, accents; not safe under normal white text |
| `--primary-hover` | `#0369a1` | Existing action hover |
| `--primary-light` | `#e0f2fe` | Informational background |
| `--primary-dark` | `#075985` | Informational text |
| `--secondary` | `#0f766e` | Teal accent |
| `--secondary-light` | `#ccfbf1` | Teal tint |
| `--success` | `#15803d` | Positive text |
| `--success-bg` | `#dcfce7` | Positive background |
| `--success-border` | `#86efac` | Positive border |
| `--warning` | `#b45309` | Warning text |
| `--warning-bg` | `#fef3c7` | Warning background |
| `--warning-border` | `#fde68a` | Warning border |
| `--danger` | `#b91c1c` | Danger text |
| `--danger-bg` | `#fee2e2` | Danger background |
| `--danger-border` | `#fca5a5` | Danger border |
| `--neutral-50` | `#f8fafc` | App and table header background |
| `--neutral-100` | `#f1f5f9` | Secondary buttons, chips |
| `--neutral-200` | `#e2e8f0` | Dividers and archived badges |
| `--neutral-300` | `#cbd5e1` | Neutral badge borders |
| `--neutral-400` | `#94a3b8` | Disabled tab text |
| `--neutral-500` | `#64748b` | Muted text |
| `--neutral-600` | `#475569` | Secondary text |
| `--neutral-700` | `#334155` | Dark border override |
| `--neutral-800` | `#1e293b` | Dark surface override |
| `--neutral-900` | `#0f172a` | Main light text / dark app |
| `--bg-app` | `#f8fafc` | App background |
| `--bg-surface` | `#ffffff` | Surface |
| `--border-color` | `#e2e8f0` | Decorative boundary |
| `--text-primary` | `#0f172a` | Main text |
| `--text-secondary` | `#475569` | Secondary text |
| `--text-muted` | `#64748b` | Muted text |

### Proposed light semantic mapping — not current consistent production behavior

All values are from **T**; role names below are design decisions, not newly discovered source tokens.

| Proposed role | Existing source token/value | Rule |
| --- | --- | --- |
| Action | `--primary-hover` / `#0369a1` | White normal text; hover uses `--primary-dark` |
| Sidebar | `--neutral-900` / `#0f172a` | White text; a future prototype role, not current shell color |
| Background | `--bg-app` / `#f8fafc` | Light only |
| Surface | `--bg-surface` / `#ffffff` | Cards, fields |
| Main text | `--text-primary` / `#0f172a` | Body/headings |
| Secondary text | `--text-secondary` / `#475569` | Supporting text |
| Decorative border | `--border-color` / `#e2e8f0` | Not the sole field boundary |
| Positive | `--success` / `#15803d` | Text plus explicit status label |
| Warning | `--warning` / `#b45309` | Text plus explicit status label |
| Danger | `--danger` / `#b91c1c` | Text plus explicit status label |
| Accent | `--secondary` / `#0f766e` | Teal emphasis |

Accessibility corrections for the board and next prototype: use `--neutral-500` for the field boundary (not the faint decorative border); use a 3px solid `--primary-dark` focus outline with 3px offset on light surfaces, and `--bg-surface` on dark surfaces. The 3px geometry comes from **S** focus rules; the color mapping is proposed. Keep focus outside unclipped controls. Never use `--primary` with normal white text: contrast is approximately 4.10:1, below AA 4.5:1. Proposed action contrast is approximately 5.93:1.

## Typography

| Rule | Value | Source |
| --- | --- | --- |
| Sans / heading tokens | `system-ui, 'Segoe UI', Roboto, sans-serif` | I `--sans`, `--heading` |
| Mono token | `ui-monospace, Consolas, monospace` | I `--mono` |
| Template base | `18px / 145%`, tracking `0.18px`; `16px` at max-width `1024px` | I root |
| Template h1 | `56px`, weight `500`, tracking `-1.68px`, margin `32px 0`; `36px`, margin `20px 0` at max-width `1024px` | I h1 |
| Template h2 | `24px / 118%`, weight `500`, tracking `-0.24px`, bottom margin `8px`; `20px` at max-width `1024px` | I h2 |
| Template code | `15px / 135%`, padding `4px 8px`, radius `4px` | I code |
| Clinical type scale | `11` dev badge; `12` status/subtitle; `13` detail; `14` controls/table; `15` alert title; `16` modal title; `17` card title; `18` brand; `20` brand icon; `24` close button; `40px` empty icon | C respective selectors |
| Clinical weights | `600` controls/status/table headers; `700` titles; `800` grave status | C |

Board uses the I sans and mono stacks only. C currently uses `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`; S uses `system-ui, sans-serif`. Those are documented discrepancies, not additional approved prototype stacks. The 56px template heading is shown as an inventory specimen, not a mandate for dense ERP pages. Board uses 24px section headings and 14px body/control text from the available scale.

## Spacing, geometry and elevation

| Reference | Existing values | Source |
| --- | --- | --- |
| Selected spacing scale (px) | `0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 48` | C: zero nav/modal resets; dev badge 2; badge 4; badge gap 6; tab gap 8; tab/input 10; header gap 12; input 14; header 16; tab 18; button 20; card 24; empty state 48 |
| Small / medium / large radius | `6px / 10px / 16px` | T `--radius-sm/md/lg` |
| Other existing radii | `4px` code; `9999px` badge; `50%` spinner/timeline point | I code; C status/spinner/timeline |
| Small shadow | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | T `--shadow-sm` |
| Medium shadow | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | T `--shadow-md` |
| Large shadow | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | T `--shadow-lg` |
| Layout | Content max `1200px`, padding `24px 20px`; header `16px 24px`, gap `12px` | C main/header |
| Modal | Max width `520px`, max height `90vh`, overlay padding `16px`, blur `2px`, overlay `rgba(15, 23, 42, 0.6)` | C modal |

The scale selects actual spacing rules, not a new mathematical progression. Board width **1440px** is the requested presentation canvas, not a source layout token. Grid composition is presentation-only; it introduces no new color, type, spacing or radius values.

## Component contract

| Component | Existing source rule | Board / future prototype rule |
| --- | --- | --- |
| Primary button | C `.btn-primary`: `10px 20px`, `14px/600`, radius md, gap `8px`, no border; primary → primary-hover; disabled opacity `.6` | Preserve geometry; proposed action → primary-dark for AA. Static specimen, no data mutation |
| Secondary button | C `.btn-secondary`: `10px 16px`, `14px/600`, radius md, `1px` border; neutral-100 → neutral-200; secondary text | Preserve |
| Search input | C `.search-input`: min `280px`, `10px 14px`, `14px`, md radius, `1px` border; primary focus + `0 0 0 3px rgba(2, 132, 199, 0.15)` | Preserve dimensions; proposed neutral-500 border and solid focus. Explicit visible label, not placeholder-only |
| Card | C `.clinic-card`: surface, `1px` border, lg radius, small shadow, `24px` padding/margin-bottom | Preserve |
| Table | C `.clinic-table`: full width, collapse borders, `14px`, left align; cells `12px 16px`, bottom `1px` border; header neutral-50 / secondary / 600; hover neutral-50 | Preserve; caption and scoped column headers |
| Status | C `.status-badge`: `4px 10px`, `12px/600`, uppercase, `6px` gap, pill | Explicit label; success/warning/danger use matching T text/bg/border; severe weight 800 |
| Neutral / info status | C archived neutral-200/600/300; denied neutral-100/600/300; unevaluated primary-light/dark/primary; mild primary-light/dark | Preserve contrast and text label |
| Tabs | C `10px 18px`, `14px/600`, `3px` bottom border, gap `8px`; primary active/hover; disabled neutral-400 at `.7` opacity | Use proposed action color for normal-sized active text on white; disabled is non-interactive |
| Alerts | C `16px 20px`, md radius, gap `14px`; danger/warning/info palettes; title `15px/700`, detail `13px` at `.9` opacity | Prefer opaque status text; do not communicate severity only with color |
| Motion | C transitions `.15s` / `.2s`, spinner `.8s`, modal `.15s` | Board has no animation or transitions; reduced-motion is explicitly supported. Future prototype must suppress optional motion |

## What is not unified

- **T auto-dark:** overrides app/surface/border/main/secondary/muted text and neutral-100/200/50 with `#0f172a`, `#1e293b`, `#334155`, `#f8fafc`, `#cbd5e1`, `#94a3b8`, `#1e293b`, `#334155`, `#0f172a` respectively. Status tints remain light.
- **I template light palette:** `--text #6b6375`, `--text-h #08060d`, `--bg #fff`, `--border #e5e4e7`, `--code-bg #f4f3ec`, `--accent #aa3bff`, `--accent-bg rgba(170, 59, 255, 0.1)`, `--accent-border rgba(170, 59, 255, 0.5)`, `--social-bg rgba(244, 243, 236, 0.5)`. Template shadow is `rgba(0, 0, 0, 0.1) 0 10px 15px -3px, rgba(0, 0, 0, 0.05) 0 4px 6px -2px`.
- **I template auto-dark:** those nine colors become `#9ca3af`, `#f3f4f6`, `#16171d`, `#2e303a`, `#1f2028`, `#c084fc`, `rgba(192, 132, 252, 0.15)`, `rgba(192, 132, 252, 0.5)`, `rgba(47, 48, 58, 0.5)`; shadow becomes `rgba(0, 0, 0, 0.4) 0 10px 15px -3px, rgba(0, 0, 0, 0.25) 0 4px 6px -2px`. I declares `color-scheme: light dark` and headings still use template `--text-h`.
- **S current chrome:** body `#f5f7fb` / `#17263c`; header `#10263e` / white; active link `#335675`; focus `#f0c56b`. Header uses `1rem 1.5rem` padding, `1rem` gap; links `.6rem` padding / `.3rem` radius; main `1.5rem` padding; mobile `.75rem`. These differ from clinical tokens. Do not silently substitute them into this contract.

Consequently there is **no ready unified dark theme**. The board pins `color-scheme: light`, does not inherit auto-dark CSS, and illustrates only the clinical light palette. Template and shell palettes are recorded for reconciliation, not previewed as approved alternatives.

## Self-check and validation boundary

The board's CSS color inventory is exactly the 26 unique T light colors plus T black shadow alpha values. Text uses main/secondary/action/dark-primary/teal/status colors and white. Font families are exactly the two unique I stacks; no external assets, scripts, URLs or fonts. Swatch colors sit in text-free decorative chips; labels are on white, never automatically white on arbitrary swatches.

Actual text/background contrast pairs are listed on the board and independently calculable with WCAG relative luminance. Include body on app/white, secondary on white/neutral-50/100/200, white on proposed action/hover/sidebar/teal, each status on its tint, dark-primary on primary-light, and token labels on white. The disabled specimen is exempt; decorative borders are not claimed as accessible field boundaries. Hover table cells retain main text.

Sync-only exception: no meaningful behavior RED/GREEN, runtime test, browser check or application build is applicable or claimed. Structural checks should verify HTML nesting, local Markdown links, balanced fences, CSS colors/font stacks against sources, token counts, contrast and absence of external assets. The board is a source reference, not an interactive prototype; its example buttons intentionally have no workflow.

## Next step

Parent creates the staff-only ERP prototype in a separate handoff using this contract, then opens the canvas once the artboard is ready. This sync does not authorize production theme changes.
