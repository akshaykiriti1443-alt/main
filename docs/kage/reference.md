# Kage — reference

Lookup tables for working on `index.html`. Pinned to commit `4399487`.
Narrative context lives in [`architecture.md`](architecture.md).

---

## URL parameters

All parsed at module load from `location.search` (`index.html:1216-1218`, `2267-2278`,
`4699`, `4793`).

| Parameter | Default | Effect |
|---|---|---|
| `q` | `low` on coarse pointers, else `high` | Quality tier. `low` halves particle counts, drops rain entirely, uses a 1024² shadow map, disables shadows by default, and skips MSAA |
| `post` | `1` | `0` bypasses the whole bloom + composite chain. The renderer switches to sRGB output with ACES tone mapping so the debug view stays sane, and card views render straight into the framebuffer instead of via a render target |
| `shadow` | `0` on low, `1` on high | `0` disables shadow mapping |
| `dpr` | `1.4` on low, `1.8` on high | Hard cap on device pixel ratio, before the adaptive governor scales it |
| `adapt` | `1` | `0` locks the performance governor, freezing the pixel-ratio scale at 1.0 |
| `nogl` | `0` | Any other value throws during job 2, exercising the no-WebGL fallback layout |
| `driver` | `raf` | `timer` swaps `requestAnimationFrame` for `setTimeout(…, 16)` |
| `shot` | *(absent)* | Any value enters deterministic review mode: jumps to anchor N (clamped 0–5), intro complete, wordmark fully revealed, fade finished, every reveal applied, body unlocked |

Useful combinations:

```
?shot=2                 chapter II, deterministic, ready to screenshot
?post=0                 see the raw scene without the grade
?nogl=1                 the reading-only fallback
?q=low&dpr=1&adapt=0    worst-case quality, pinned
```

---

## Debug handles

`start()` publishes `window.__kage` (aliased `window.__secret`):

| Key | Contents |
|---|---|
| `RIG` | `{prog, smooth, mx, my, tmx, tmy, intro, focus, focusAmt}` — live scroll and pointer state |
| `WORLD` | every named scene handle: `sky`, `floor`, `floorMat`, `moon`, `moonHalo`, `key`, `hallLight`, `hallHalo`, `moonLight`, `lanternLights`, `lanternGlows`, `haze`, `embers`, `rain`, `ripples`, `leaves`, `fg`, `uT` |
| `WORD` | `{glyphs, group, ink, reveal, rise}` |
| `CAM` | the six waypoint literals — mutable, but the spline is built once at boot |
| `POST` | render targets, bloom levels and all shader materials; edit `POST.comp.uniforms.*.value` live |
| `renderer`, `scene`, `camera` | the Three.js objects |
| `anchors()` | current scroll anchors per section |

On the fallback path it is instead `{fallback: true, error}`.

Live grade tweaking:

```js
__kage.POST.comp.uniforms.uBloom.value = 0.6;   // default 0.34
__kage.POST.comp.uniforms.uExp.value   = 0.8;   // default 0.62
__kage.POST.comp.uniforms.uGrain.value = 0;     // default 0.020
```

---

## Constants

### Site plan — metres (`2482-2487`)

| Name | Value |
|---|---:|
| `PODIUM` | 7.0 |
| `STEPS` | 40 |
| `STAIR_Z0` | −11.0 |
| `STAIR_RUN` | 0.55 |
| `STAIR_W` | 8.4 |
| `TEMPLE_Z` | −44 |
| `MOON` | `{x: 17.9, y: 31.9, z: −72, r: 8.6}` |
| `WORD_Z` | 3.0 |

Derived at build time, not stored: the flight tops out at `STAIR_Z0 − STEPS·STAIR_RUN`
≈ −33, and the lanterns flanking it solve their own height and half-width from the same
four numbers (`4718-4720`).

### Camera waypoints (`4034-4041`)

| # | Section id | `data-cam` | Position | Look-at | FOV |
|---:|---|---:|---|---|---:|
| 0 | `#hero` | 0 | `0, 4.05, 13.6` | `0, 6.60, −18.0` | 36 |
| 1 | `#gate` | 1 | `−5.6, 2.35, 11.6` | `1.2, 5.60, −14.0` | 48 |
| 2 | `#pathways` | 2 | `1.2, 3.60, 2.2` | `−0.6, 7.50, −22.0` | 40 |
| 3 | `#lessons` | 3 | `5.2, 2.10, −3.4` | `−2.6, 7.00, −20.0` | 46 |
| 4 | `#eternity` | 4 | `0, 7.60, −16.0` | `0, 13.0, −40.0` | 42 |
| 5 | `footer` | 5 | `0, 10.5, −20.0` | `0, 3.00, −34.0` | 46 |

Spline tension 0.42, non-closed, on both position and target.

### Rig tuning (`4055-4085`)

| Value | Where | Meaning |
|---|---|---|
| `1.62` / `1.05` | `aspectFix` | aspect at which compensation starts, and the range it normalises over |
| `8.2`, `1.1`, `0.40` | `fitAspect` | max dolly-back, max lift, max FOV multiplier on a tall frame |
| `5.6`, `0.65`, `8` | intro dolly | extra z, extra y, extra FOV at the start |
| `2.4 s` | `RIG.intro` ramp | opening dolly duration |
| `0.62` / `0.34` | parallax | camera x/y response to the pointer |
| `0.20` / `0.12` | parallax | counter-motion on the look-at target |
| `5.2` | `damp` rate | scroll → camera smoothing |
| `2.6` | `damp` rate | pointer smoothing |

### Card viewports (`4443-4446`)

| `data-view` | Element | Position | Look-at | FOV |
|---:|---|---|---|---:|
| 0 | card — *Approach / The long climb* | `−2.0, 1.60, −2.0` | `0, 10.0, −34.0` | 40 |
| 1 | card — *Lanterns / Lantern court* | `4.2, 2.90, −9.5` | `6.4, 2.90, −14.4` | 40 |
| 2 | card — *Moonwater / The wet court* | `3.4, 2.40, 2.0` | `−1.0, −0.60, −6.0` | 40 |
| 3 | `.peek` hero preview | `0.6, 3.40, −12.0` | `0, 12.0, −40.0` | 26 |

Hover push: 0.55 units along the view axis, damped at rate 3.4.
Refresh rota: `(FRAME + i*7) % 24 === 0`.
Blit skipped below effective opacity 0.995, or when the frame carries `.on-cloth`.

### Particles and atmosphere

| System | Low | High | Notes |
|---|---:|---:|---|
| Haze slabs | 4 | 6 | additive planes, camera-facing |
| Embers | 220 | 460 | `Points`, GPU-side vertical wrap over 11.5 units |
| Rain | — | 900 pairs | `LineSegments`, alpha 0.024, skipped entirely on low |
| Ripples | 6 | 13 | 4 s cycle, random respawn |
| Leaves | 110 | 260 | `InstancedMesh` of 0.40 m quads |
| Cursor wisps | 90 | 190 | `Points`, child of the camera; skipped on coarse pointers |

Leaf recycling: `LEAF_AHEAD = 11` (respawn distance down the sight line),
`LEAF_SPREAD = 12` (respawn disc radius), `LEAF_R = 30` (far wrap backstop).
Wisps hang on a plane `WISP_D = 3.4` units from the lens.

### Cloth (`3499-3505`)

| Constant | Value |
|---|---:|
| `CL_SEG` / `CL_NODES` | 96 / 97 |
| `CL_DT` | 1/120 |
| `CL_WAVE` | 30 |
| `CL_STIFF` | 0.55 |
| `CL_GAIN` | 5.0 |
| `CL_BLEED` | 48 px |

Per-instance options as used on the cards (`3862-3864`): `pin: 'top'`, `wind: 3`,
`speed: .5`, `amplitude: 30`, `drape: 40`, `brush: 2.05`, `brushSize: 150`,
`damping: 1`, `light: .5`, `sheen: .1`, `shadow: .25`, `cornerRadius: 20`,
`perspective: 1200`. Pointer enter/leave switches the SDF rim from `.048` to `.185`.

### Post-processing uniforms (`3948-3975`)

| Uniform | Default | Effect |
|---|---:|---|
| `uThr` / `uKnee` | 0.86 / 0.50 | bright-pass threshold and soft knee |
| `uBloom` | 0.34 | bloom mix |
| `uCA` | 1 | chromatic aberration multiplier |
| `uGrain` | 0.020 | animated hash grain |
| `uVig` | 1 | vignette mix |
| `uExp` | 0.62 | pre-tone-map exposure |
| `uSat` | 1.05 | saturation |
| `uFade` | driven | 700 ms fade-in from the preloader |

Bloom pyramid: 4 levels starting at half resolution, additive upsample at 0.52.

### Performance governor (`4676-4683`)

| Value | Meaning |
|---:|---|
| 2.2 s | warm-up before the governor engages |
| 40 frames / 0.9 s | sampling window |
| 23.0 ms | average frame time above which resolution drops |
| ×0.85 / ×0.64 | scale-down factor (the latter past 50 ms average) |
| 0.55 | resolution floor |
| 13.8 ms | average below which resolution walks back up |
| +0.08 | scale-up step, ceiling 1.0 |
| 0.78 | scale above which 2× MSAA is kept |

---

## CSS tokens (`:root`, `index.html:12-28`)

| Token | Value | Role |
|---|---|---|
| `--ink` | `#05070a` | page black — also the renderer clear colour |
| `--ink-2` | `#0a0e12` | raised black |
| `--bone` | `#dfe7e0` | pale sage white of the wordmark |
| `--bone-dim` | `#aab4ad` | secondary type |
| `--muted` | `#78837c` | labels |
| `--line` / `--line-soft` | `rgba(223,231,224,.13)` / `.07` | rules |
| `--vermilion` | `#e0231c` | the moon, the mark, `::selection` |
| `--ember` | `#ff5a3c` | lantern accents |
| `--gold` | `#c9a24a` | metal fittings |
| `--pad` | `clamp(20px, 3.4vw, 56px)` | page gutter |
| `--nav-h` | `84px` | header height |
| `--ease` / `--ease-out` / `--ease-io` | cubic-beziers | the three motion curves |
| `--vw` | written by `resize()` | **layout** viewport width in px; the nav sizes from this, not from `right:0` |

Fonts (`secret-pathways-assets/fonts.css`, all base64 `woff2` subsets, no network):
`Onest` (body), `NotoJP` (Japanese display), `Wordmark` (the 3D "KAGE" glyphs).

## Layout variants

`<body>` carries six switches, all `"b"` in the shipped page:

```html
<body data-layout-hero="b" data-layout-story="b" data-layout-gallery="b"
      data-layout-curriculum="b" data-layout-closing="b" data-layout-footer="b">
```

| Attribute | `b` composition |
|---|---|
| `data-layout-hero` | split — editorial reading column left, live window in the open right corner, Japanese title down the right edge |
| `data-layout-story` | spread — title crosses two columns |
| `data-layout-gallery` | mosaic — one immersive live window beside two stacked ones |
| `data-layout-curriculum` | atlas — a two-then-three plate grid instead of a syllabus list |
| `data-layout-closing` | gallery — title hangs vertically on the right |
| `data-layout-footer` | manifesto — the statement leads, navigation becomes a rail |

Removing an attribute drops that block back to the A-set baseline in `index.html:227-447`.

## Breakpoints and preference queries

| Query | Effect |
|---|---|
| `max-width: 1080px` | condensed grids, smaller foreground plates |
| `max-width: 820px` | nav collapses to a sheet, `.peek` preview hidden |
| `max-width: 560px` | chapter chips stand their numeral above the label instead of beside it |
| `hover: hover and pointer: fine` | custom cursor becomes visible |
| `hover: none` (`COARSE`) | low quality tier, no wisps, no cloth |
| `prefers-reduced-motion: reduce` | undamped camera, no intro dolly, no word splitting, no reveal stagger, foreground parks without blurring, sway animations off |

---

## Assets

```
kage/
├─ index.html                             244 KB   markup + CSS + all logic
├─ README.md · PROMPT.md                            upstream docs
├─ .nojekyll                                        GitHub Pages: serve underscore paths verbatim
├─ assets/kage-preview.webp               100 KB   social/preview image
└─ secret-pathways-assets/
   ├─ three.min.js                        596 KB   Three.js r149, MIT
   ├─ fonts.css                           100 KB   three base64 woff2 subsets
   ├─ generated/                          660 KB   four cinematic plates
   │   ├─ kage-sanmon-preview.webp                 → .peek hero window
   │   ├─ kage-approach.webp                       → card 1, Approach
   │   ├─ kage-lantern-court.webp                  → card 2, Lanterns
   │   └─ kage-moonwater.webp                      → card 3, Moonwater
   └─ foreground/png/                     1.9 MB   ten alpha cut-outs (WebP despite the folder name)
       hill · sakura-branch · garden-bush · stone-lantern · basalt-stones
       tall-grass · maple-leaves · pine-tree · temple-wall · shrine-ruins
```

Every path in the document is relative, so the site works unchanged under a GitHub
Pages repository subpath.

### Foreground cut-outs per chapter

Set on `.fg[data-fg]`; placement rules key off the attribute, not the section id, so a
stage keeps its composition after being re-parented into `#fg-sky`.

| `data-fg` | Section | Pieces (entry direction) |
|---|---|---|
| `gate` | I — The Sanmon | temple-wall (left), pine-tree (right), tall-grass (up) |
| `pathways` | II — Still Gardens | sakura-branch (left, sway), maple-leaves (right, sway), stone-lantern (up), garden-bush (up) |
| `lessons` | III — Sacred Craft | temple-wall flipped (right), basalt-stones (up), tall-grass (up) |
| `eternity` | IV — Afterlight | hill (up), shrine-ruins (left), tall-grass (up), sakura-branch (left) |
| `foot` | Colophon | garden-bush (up), tall-grass (up), basalt-stones (up) |

All plates are filtered `saturate(.88) brightness(.86)` to sit in the night grade —
except the stone lantern under `pathways`, which keeps its ember at full brightness as
the only lit object in the library.

---

## Recipes

**Move the camera through a chapter.** Edit the corresponding row of `CAM`
(`4034`). Position and target are separate splines, so you can swing the look-at
without moving the rig. Verify on a tall frame too: `fitAspect` will add up to 8.2
units of dolly-back and 40 % more FOV on a phone.

**Re-proportion the approach.** Change the site-plan constants (`2482`). The flight,
the podium, the flanking lanterns and the camera-relevant depths all derive from them;
`TEMPLE_Z` moves the hall, `PODIUM` and `STEPS` re-solve the stairs and everything
standing on them.

**Change the grade.** Everything visual after the scene render is in `POST.comp`'s
fragment shader (`3977`). Tune live through `__kage.POST.comp.uniforms` first, then
write the value back. Remember the contrast curve is applied *after* the gamma encode,
pivoted at 0.30.

**Add a chapter.** Add a `<section data-cam="N">` in document order, add a matching
`CAM` waypoint, and extend the `names` array in `wireNav` (`4332`) so the rail dot and
its `aria-label` exist. `measure()` and `progressFor()` pick the section up
automatically from `[data-cam]`.

**Add a live view inside an HTML element.** Give the element `data-view="N"`, put a
`[data-frame]` child where the blit should stop (without it the view paints over the
whole anchor, including any caption), and add the camera definition to `defs` in
`buildCards` (`4442`).

**Add a foreground cut-out.** Add a `<span class="fg-el fg-NAME" data-fg-in="up|left|right">`
with an `<img>` inside the chapter's `.fg`, then add a `[data-fg="chapter"] .fg-NAME`
placement rule near `index.html:738`. Add `fg-el--sway` for the slow 21 s breath, or
`fg-el--flip` to mirror the plate.

**Add a generated surface.** Write a `tex*()` returning `{map, normal, rough}` canvases
(use `fbmCanvas` for the height field and `normalFromHeight` to derive the normal), then
hang it with `surface(tex, [repeatU, repeatV], {color, roughness, normal})`. If it is
used more than once, wrap the generator in `lib('key', …)`.

**Keep something out of the in-card views.** Call `layers.set(1)` on it — card cameras
are pinned to layer 0. Layer 2 is reserved for the wordmark.

**Add a build step to the preloader.** Push `['Label', () => …]` onto `JOBS` (`4703`).
Jobs run one per frame, may return a promise, and anything after index 1 that throws is
logged without killing the page.

---

## Pre-ship checklist

From the project's own `PROMPT.md`, and worth keeping:

- Verify at desktop **and** ≈390 × 844 — most of the code's hard-won fixes are
  narrow-frame fixes.
- Check every asset for 404s.
- Parse every inline script; inspect the browser console.
- Test one complete scroll and one complete navigation interaction.
- Confirm the reduced-motion path still delivers the full reading experience.
- Confirm `?nogl=1` still produces a readable page.
