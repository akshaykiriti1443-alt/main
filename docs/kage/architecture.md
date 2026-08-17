# Kage — architecture

A walkthrough of `index.html`. Line references are pinned to commit
`4399487` and are approximate anchors, not contracts.

The whole project is four files that matter: one HTML document, one vendored
Three.js build, one stylesheet of base64 font subsets, and a folder of WebP imagery.
`index.html` holds the markup, the CSS, the entire 3D scene, the scroll choreography
and the interaction logic in that order:

```
index.html      4 821 lines
├─ 1 …    9     head, meta, font stylesheet link
├─ 10 …  884    <style> — tokens, layers, type, sections, foreground stages, responsive
├─ 886 … 1204   <body> — preloader, nav, six scroll sections, footer, #fg-sky, rail
└─ 1206 … 4819  <script> — fifteen numbered modules (below)
```

---

## 1. The layer model

There is exactly one WebGL canvas. Everything else is DOM stacked over it by
`z-index`, and the ordering is load-bearing:

| Layer | Element | `z-index` | Role |
|---|---|---:|---|
| Scene | `#gl` | 0 | fixed full-viewport canvas, the environmental layer |
| Page | `.page` | 10 | the whole scrolling document — a stacking context |
| Rail | `.rail` | 45 | chapter dots down the right edge |
| Nav | `.nav` | 50 | fixed header |
| Near plane | `#fg-sky` | 52 | host for the active chapter's foreground cut-outs |
| Vignette | `#vignette` | 55 | radial darkening |
| Grain | `#grain` | 60 | 180 px seeded noise tile, `mix-blend-mode: overlay` |
| Cursor | `.cur-dot` | 80 | custom cursor, fine pointers only |
| Preloader | `#pre` | 100 | covers everything until the scene is built |

`#fg-sky` exists purely because `.page` is a stacking context at `z-index:10`:
nothing parented inside it can ever paint over the nav. Foreground cut-outs are
therefore **re-parented out of their section into `#fg-sky`** while their chapter is
active, which is the only way a branch of maple can pass in front of the header
(`index.html:1198-1201`, `wireForegroundStages` at `4205`).

Note the split personality of the "foreground": there are *two* independent
foreground systems, and they are easy to confuse.

* **3D cut-outs** — six procedurally drawn alpha planes living in the Three.js scene
  near the lens (`buildForeground`, `2989`). Grass, rocks, a bough. These are geometry.
* **DOM cut-outs** — the WebP artwork in `.fg` stages, one set per chapter
  (`index.html:979` onward). These are `<img>` elements. Also called the "near plane".

---

## 2. Module map

The script is one IIFE in strict mode, divided by banner comments:

| # | Module | Lines | Contents |
|---:|---|---|---|
| 0 | basics | 1215 | query-string helpers, `REDUCE`/`COARSE` media queries, `clamp`/`lerp`/`smooth`/`easeOut`/`easeIO`, frame-rate-independent `damp`, `mulberry32` PRNG, Perlin `noise2D`, `fbm` |
| 1 | canvas | 1265 | `cvs`, `fbmCanvas` (stacked up-scaled value noise), `normalFromHeight` (blur → Sobel → tangent normal map) |
| 2 | surfaces | 1318 | every texture generator: `texWall`, `texFloor`, `texWood`, `texStone`, `texLacquer`, `texShoji`, `texLeaf`, `texSky`, `texRidge`, `texRoof`, `texMoon`, `texGlow`, `texWisp` |
| 3 | cut-outs | 2046 | `texGrassCutout`, `texRockCutout`, `texBranchCutout` — alpha plates for the near planes |
| 4 | gl | 2255 | viewport helpers, `initGL`, `tx`, `surface`, the `LIB` texture cache, `sweepPoly`, `roofGeo`, `mergeGeos` |
| 5 | the world | 2475 | site-plan constants and every `build*` function: shell, temple, moon, torii, lanterns, maples, rocks, foreground, wordmark, atmosphere |
| 6b | leaf fall | 3173 | instanced maple leaves recycled around the rig |
| 6c | cursor wisps | 3258 | pointer-trail motes parented to the camera |
| — | cloth | 3383 | WebGL2 cloth simulation for the card plates |
| 6 | planar mirror | 3923 | **vestigial** — the banner survives, the mirror does not (see §9) |
| 7 | post-processing | 3924 | bloom pyramid and the composite shader |
| 8 | camera rig | 4033 | six waypoints, spline interpolation, aspect compensation, parallax |
| 9 | scroll ↔ chapters | 4087 | anchor measurement and the continuous progress function |
| 10 | wordmark layout | 4106 | fits the 3D "KAGE" to the hero frame by unprojection |
| 11 | page wiring | 4141 | reveals, word splitting, foreground stages, hero exit, nav, focus, cursor, grain |
| 12 | card viewports | 4439 | render-to-target and blit for the in-card 3D views |
| 13 | the machine | 4566 | `resize`, `updateWorld`, `render`, the `frame` loop and the performance governor |
| 14 | booting | 4702 | the job list, preloader, WebGL fallback, `start` |

---

## 3. The texture pipeline

Nothing in the 3D scene is loaded. Every surface is drawn into a 2-D canvas at boot
and uploaded as a `CanvasTexture`.

```
mulberry32(seed) ─┬─→ noise2D / fbm            (per-pixel, used for detail work)
                  └─→ fbmCanvas(W,H,seed,…)    (stacked up-scaled value noise)
                                │
                                ├─→ tex*()  → { map, normal, rough } canvases
                                │              normal via normalFromHeight()
                                │
                                └─→ tx(canvas, {wrap, repeat, aniso, srgb})
                                        └─→ surface(t, repeat, opts) → MeshStandardMaterial
```

Three details are worth internalising because they explain most of the code's shape:

* **`fbmCanvas` is a cheat.** Rather than evaluating fbm per pixel, it draws a stack
  of tiny random-value canvases scaled up with smoothing and composited in `overlay`
  mode, halving cell size and alpha each octave. The comment claims ~30× faster and
  indistinguishable once multiplied under a dark albedo (`1269`).
* **Normal maps are derived, not authored.** `normalFromHeight` blurs the height
  canvas by 1.1 px, runs a Sobel pair, and packs the normalised result into RGB
  (`1294`).
* **`LIB` caches generators by key.** `buildLantern` is called six times; without the
  cache that would be six granite generations and six normal-map passes
  (`2339-2347`). Materials are re-tinted per use via `surface(..., {color})` on an
  already-dark albedo rather than regenerated.

`surface()` deliberately pins `roughness: 1` by default: the roughness map carries the
variation, and anything lower scales the whole surface toward a polish it should not
have.

---

## 4. Renderer configuration

`initGL` (`2277`) is where the project's quality posture is set:

* Canvas size comes from `document.documentElement.clientWidth/Height`, **never**
  `innerWidth`. On mobile the initial containing block can be wider than the visual
  viewport (measured 437 against a 390 px phone), and sizing from `innerWidth`
  renders a frame wider than the phone shows — which is how the wordmark lost its
  last letter. Every size, aspect and pointer mapping goes through `vpW()`/`vpH()`
  (`2257-2265`). The same value is written back to CSS as `--vw` on every resize,
  because a `position:fixed` header resolves its insets against that same over-wide
  block.
* When post-processing is on, the renderer runs in **linear** output with **no** tone
  mapping — both are handled by the composite shader instead. With `?post=0` it falls
  back to sRGB output and ACES tone mapping so the debug path still looks sane
  (`2286-2288`).
* Antialiasing is `!WANT_POST`: with post enabled the scene target uses 2× MSAA
  samples instead, and multisampling is the first thing the performance governor
  drops (`4583-4587`).
* `FogExp2(0x050a0e, 0.0168)` plus a `0x060a0d` background. The fog *colour*, not the
  material colours, is what sets how dark the hall reads at depth — at that distance
  most of the building's pixel is fog.
* Camera: 36° FOV, near `0.35`, far `220`.

---

## 5. The world

### Site plan

Everything downstream — camera waypoints, lantern rows, the moon — is pinned to five
constants in metres (`2482-2487`), so the approach can be re-proportioned in one
place:

| Constant | Value | Meaning |
|---|---:|---|
| `PODIUM` | 7.0 | height of the podium above the court |
| `STEPS` | 40 | risers in the flight |
| `STAIR_Z0` | −11.0 | z of the bottom riser |
| `STAIR_RUN` | 0.55 | riser depth → the flight tops out at z ≈ −33 |
| `STAIR_W` | 8.4 | stair width at the top (splayed at the foot) |
| `TEMPLE_Z` | −44 | the hall's centre line |

`buildShell` (`2489`) raises the sky plane, two fog-eaten ridgelines, a 150×150 floor,
the podium, its coping, and the flight. The forty treads and eighty cheek blocks are
built as separate `BoxGeometry`, translated in place and **merged into two buffers**
(`mergeGeos`) — as individual meshes that would be 120 draw calls for a shape nobody
gets close to.

The lanterns flanking the flight illustrate the value of the shared plan: their
heights are *solved* from `STAIR_Z0`/`STAIR_RUN`/`PODIUM`/`STAIR_W` so they stand on
the rail rather than beside it (`4718-4725`). Earlier flat heights left both pairs
hanging in the air.

### Geometry helpers

* `sweepPoly(points, profile)` — sweeps a polygonal cross-section along a path with a
  Frenet-ish frame, generating positions, normals, UVs, indices and end caps. Used
  for the torii's *kasagi* and *shimaki* and for beams.
* `roofGeo(A, B, R, Hr, thick, flare)` — a temple roof whose height is a concave
  function of Chebyshev distance from centre, which is what produces the flared eaves.
* `mergeGeos(list)` — concatenates buffer geometries with matching attributes.

### The moon

A single textured plane at `{x: 17.9, y: 31.9, z: −72, r: 8.6}` with an additive halo
6.4× its size behind it. Two points are instructive:

* The blood-moon grade lives in the material `color` as an HDR multiplier
  `hdr(3.6, .64, .61)`. The reference plate measures a G/R ratio of ≈0.48, but that is
  a *display* ratio — the map is decoded out of sRGB before the multiply, so the tint
  has to be written in linear, where the same look is ≈0.21. Reading the ratio
  straight off the reference is what once left the moon pale pink (`2713-2717`).
* `placeMoon()` draws the moon in horizontally by 40 % of the aspect-fix amount,
  because on a tall frame the rig steps back and its horizontal reach narrows — which
  would otherwise slide the moon off the right edge.

### Lighting

Nine lights, all static (`buildLights`, `3877`):

| Light | Colour | Intensity | Role |
|---|---|---:|---|
| `HemisphereLight` | `0x53838f` / `0x060a08` | 0.13 | ambient floor |
| Directional key | `0xb6dbe4` | 1.22 | the only shadow caster; 2048² map (1024² on low), baked once |
| Directional "moonKey" | `0xff6a42` | 0.52 | pure rim down the right slope of every roof — without it the hall is a flat black cut-out |
| Point (hall) | `0xff8a26` | 2.3 | the hall's own lamps, range 15 so they never reach the roof and turn the building into a paper lantern |
| Point ×2 (wings) | `0xff8420` | 2.2 | podium wings |
| Point (moon) | `0xff3a1c` | 3.0 | a trace of red high on the right, attaching the moon to the scene |
| Point (fill) | `0x86c6d2` | 0.95 | cold fill |
| Point (stair) | `0xffa049` | 4.2 | the flight is the spine of the composition and needs its own lamp |

Nothing that casts a shadow ever moves, so the shadow map is rendered once at boot and
`shadow.autoUpdate` is switched off (`4746`).

### Atmosphere

`buildAtmosphere` (`3075`) adds four systems:

* **Haze** — 4–6 additive plane slabs that slide across the courtyard on sine offsets
  and are re-oriented to the camera quaternion every frame.
* **Embers** — 220 (low) / 460 `Points` with a custom shader; vertical position is
  `mod`-wrapped over 11.5 units in the vertex shader, so the CPU never touches them.
* **Rain** — 900 `LineSegments` pairs, skipped entirely on low quality. Each segment
  carries `aTop`/`aSpeed`/`aLen` attributes and falls by `mod` in the vertex shader.
  Alpha is 0.024: it is felt more than seen.
* **Ripples** — 6–13 additive rings on the standing water, respawned at random
  positions on a 4-second cycle, scale and opacity driven from the cycle phase.

### The leaf fall

`buildLeafFall` (`3189`) is an `InstancedMesh` of 110/260 quads — quads and not points
specifically because a leaf is read by its tumble, and a point sprite cannot turn away
from the camera. Each leaf carries its own fall rate, sway frequency, phase, amplitude,
spin, roll rate and scale.

The recycling rule is the interesting part (`3215`). Leaves are respawned **into a
disc hung down the camera's own sight line** — `LEAF_AHEAD = 11` units in front,
`LEAF_SPREAD = 12` radius — rather than in a band centred on the rig. A centred band
spends nearly all of itself behind and beside the frustum; of a couple of hundred
leaves only a dozen were ever on screen. `LEAF_R = 30` remains as a far wrap-around
backstop for a rig that has walked out from under its own weather, and it sits well
outside the fog so nothing is seen to jump.

### The cursor wisps

`buildWisps` (`3273`) hangs 90/190 additive `Points` **as a child of the camera**, so
the pointer maps straight into camera space through the frustum's half-height at
`WISP_D = 3.4`. Unprojecting onto a world plane each frame would pin the trail to the
court, and since the rig is always drifting the wisps would swim across the screen.

Emission is by **distance travelled, not elapsed time**: a slow hand lays a continuous
drift, a fast one throws the motes apart. A timer would give an evenly spaced string of
beads at every speed. Skipped entirely on coarse pointers.

### The 3D wordmark

`buildWordmark` (`3020`) sets "KAGE" at 320 px in the `Wordmark` face into a *separate
canvas per glyph*, with a vertical gradient baked per glyph but ramped across the whole
word, and hangs each as a plane at `WORD_Z = 3.0`.

`layoutWord` (`4107`) then fits it to the frame the hard way: it builds a throwaway
camera at the hero waypoint, unprojects the left and right frame edges onto the
wordmark's z-plane, and scales the group so the ink spans that width. Two subtleties:

* The frame is judged by **shape, not width** (`vpW()/vpH() < 1.05`). A 768 px tablet
  held upright is as tall as a phone; on a width test it took the desktop baseline and
  sat below the fold with only the top of the G showing.
* Four wide-tracked letters reach the frame edge exactly, so `fill` is 1.00 on wide
  frames but 0.96 on narrow ones — a phone frame has no gutter to lose the trailing
  tracking into.

At runtime the glyphs rise from behind the grass on a staggered `WORD.reveal` ramp and
then dissolve as the camera closes on them (`4632-4641`).

### The 3D foreground cut-outs

Six alpha planes near the lens (`buildForeground`, `2989`), each sized against the
frustum at its own depth — a 26-unit sheet two metres from the lens shows only its
middle tenth. Their material is patched through `onBeforeCompile` (`2964`):

* a vertex-shader sway weighted by `uv.y²`, so the tips move and the roots do not;
* a fragment-shader alpha feather on the left, right and bottom edges, because these
  plates are drawn to the edge of their own canvas and would otherwise end on a hard
  straight line wherever the plane stops.

They also **dissolve as the camera reaches them** (`4644-4648`): opacity ramps over
0.9–4.6 units of z separation, so the camera path can walk straight through the garden
instead of steering around a veil.

---

## 6. The camera rig

Six waypoints, one per `data-cam` section (`4034-4041`):

| # | Section | Position | Look-at | FOV |
|---:|---|---|---|---:|
| 0 | hero | `0, 4.05, 13.6` | `0, 6.60, −18` | 36 |
| 1 | the sanmon | `−5.6, 2.35, 11.6` | `1.2, 5.60, −14` | 48 |
| 2 | gardens | `1.2, 3.60, 2.2` | `−0.6, 7.50, −22` | 40 |
| 3 | craft | `5.2, 2.10, −3.4` | `−2.6, 7.00, −20` | 46 |
| 4 | afterlight | `0, 7.60, −16` | `0, 13.0, −40` | 42 |
| 5 | footer | `0, 10.5, −20` | `0, 3.00, −34` | 46 |

Position and target are each a `CatmullRomCurve3` with tension 0.42, sampled at
`u = RIG.smooth / 5`; FOV is linearly interpolated between the two bracketing
waypoints. `applyCamera` (`4064`) then stacks three corrections in order:

1. **Aspect fit.** `aspectFix()` returns how far below 1.62 the current aspect ratio
   is, normalised over 1.05 and clamped to 0…1. `fitAspect` walks the camera *back
   along its own view axis* by up to 8.2 units, lifts it 1.1, and opens the FOV by up
   to 40 %. Every waypoint is composed for a wide frame; on a tall one the same
   numbers crop the gate in half.
2. **Intro dolly.** While `RIG.intro` ramps 0→1 over 2.4 s, the camera sits 5.6 units
   further back, 0.65 higher, with 8° more FOV.
3. **Parallax.** Damped pointer position nudges the camera ±0.62/±0.34 and the target
   the other way by ±0.20/±0.12, attenuated to 45 % of its strength by the time the
   walk reaches chapter 1.6 — a hand-held drift, never enough to break the frame.

---

## 7. Scroll ↔ chapters

`measure()` (`4090`) builds an `anchors` array, one scroll offset per `[data-cam]`
section: 0 for the first, `maxScroll` for the last, and the section's vertical centre
for the rest, then forces strict monotonicity.

`progressFor(y)` (`4099`) maps a scroll offset into a **continuous** chapter index by
linear interpolation between adjacent anchors. Every frame:

```js
RIG.prog   = progressFor(scrollY);
RIG.smooth = REDUCE ? RIG.prog : damp(RIG.smooth, RIG.prog, 5.2, dt);
```

`damp(cur, to, rate, dt) = lerp(cur, to, 1 - exp(-rate*dt))` — exponential smoothing
written frame-rate-independently, so the camera's lag is the same at 30 fps and
144 fps. Under `prefers-reduced-motion` the damping is bypassed entirely and the
camera tracks the scroll exactly.

`RIG.smooth` is the single number that everything else reads: the spline parameter, the
parallax attenuation, and the wordmark's dissolve.

---

## 8. The three DOM↔WebGL bridges

This is where Kage earns its "collage" description. Three separate mechanisms make
HTML and WebGL interleave.

### 8a. Card viewports — 3D inside an HTML card

`buildCards` (`4441`) attaches a private `PerspectiveCamera` to every `[data-view]`
element: three garden cards and the hero preview window. Each renders per frame
(`renderCards`, `4530`) as:

1. Read the element's `getBoundingClientRect()`; skip if off-screen.
2. Render the scene through the card camera into a **private half-float render
   target** sized to the element (`cardBuffer`).
3. Blit that target into the composite at the element's screen rect, using scissor and
   viewport set **on the render target itself** — `renderer.setScissor()` only ever
   reaches the default framebuffer, so the region has to be set on whichever surface
   is actually being drawn into (`4460-4462`).

Three guards keep it honest:

* **Refresh rota.** A card only re-renders when it is dirty, when its hover push is
  moving, or when its slot `(FRAME + i*7) % 24 === 0` comes round. The views are
  static; four scene traversals per frame buy nothing.
* **Opacity culling.** `cardAlpha(el)` walks the ancestor chain multiplying computed
  opacity, and the blit is skipped below 0.995. The canvas knows nothing about the DOM
  stacked over it, so a card the page has faded would otherwise go on painting a live
  view with no card around it — which once put a second lit hall in the corner as the
  hero exit dimmed the preview.
* **Cloth exclusion.** A card carrying cloth (`.on-cloth`) is skipped entirely: the
  fabric has no background of its own, so the blit would show through its rounded
  corners.

Hovering a card sets `want = 1`; `push` damps toward it and pushes the card camera
0.55 units along its own view axis.

### 8b. The cloth plates

`createCloth` (`3507`) is a port of Canvas UI's Cloth component, lifted off React and
off the experimental `drawElementImage()` html-in-canvas path it ships with — that path
is Chrome-behind-a-flag only. Here the fabric only ever carries a still, so the capture
is unnecessary: `clothPlate()` draws the card's own generated WebP cover-cropped into a
2-D canvas **with the card's two CSS scrims baked in** (so they ripple with the fabric
instead of sitting flat over it), and uploads that. The simulation and both shader
passes are unchanged, and the result runs in every WebGL2 browser.

| Constant | Value | Meaning |
|---|---:|---|
| `CL_SEG` / `CL_NODES` | 96 / 97 | simulation grid |
| `CL_DT` | 1/120 | fixed sim timestep |
| `CL_WAVE`, `CL_STIFF`, `CL_GAIN` | 30, 0.55, 5.0 | wave propagation and stiffness |
| `CL_BLEED` | 48 px | overdraw on every side, so billow and shadow are not clipped |

Rendering is two GLSL 3.00 passes over the grid. The fragment shader shades from the
per-node normal packed in `aData`, adds a tight specular and a broad sheen, and — the
neat part — **cuts the card out with a rounded-rect SDF and draws the card's outline
off that same distance field** (`3453-3467`). A CSS outline can only trace the flat
rectangle the cloth has left; this one rides every fold and takes the perspective with
it. A second pass draws an offset, lift-attenuated drop shadow from the same SDF.

Three 96² grids on one page is a third of a million cell updates a second, so each
instance hard-stops when its card leaves the viewport and again once the wind dies and
the fabric settles. Skipped entirely on coarse pointers — there is no pointer to brush
it with.

### 8c. Foreground stages — cut-outs that pass in front of the nav

`wireForegroundStages` (`4205`) drives the DOM `.fg` blocks. An `IntersectionObserver`
with `rootMargin: -12% 0 -12%` and thresholds `[0, .12, .32, .55]` tracks which
section is most visible; the winner's stage is:

* **lifted** into `#fg-sky` (with a forced reflow so the parked transform has
  something to animate from — a re-inserted element has no previous computed style and
  the entrance would otherwise land already finished),
* marked `.fg-active`, which switches it to `position:fixed; bottom:0` on a
  `min(56svh, 680px)` near plane,
* and the outgoing stage is marked `.fg-retiring` for 820 ms — long enough to blur and
  fade out — before being parked back inside its own section.

Placement rules key off `[data-fg]` rather than the section id, so the move costs
nothing in layout. Individual pieces enter from the edge they are anchored to via
`[data-fg-in="up|left|right"]`, and the two lightest layers carry a 21-second sway
animation. Under reduced motion the retire path skips the blur and parks immediately.

---

## 9. Layers, and the mirror that is not there

Three.js layers are used to keep near-lens objects out of secondary renders
(`4737-4743`):

| Layer | Contents |
|---:|---|
| 0 | the world — architecture, terrain, moon, atmosphere |
| 1 | 3D foreground cut-outs, rain, leaves, ripples, cursor wisps |
| 2 | the 3D wordmark glyphs |

The main camera enables 1 and 2. **Card cameras call `layers.set(0)`**, so the in-card
views show only the world: no grass across the lens, no wordmark, no rain.

The banner at `3923` still reads `6 · planar mirror`, and several comments reference a
reflection buffer — the court's paving material notes that its near-polished settings
were tuned to feed a mirror that has since been removed, and were reverted to wet
stone because they made the paving read as sheet metal (`2528-2533`). The layer split
is the mirror's most visible surviving artefact. Treat the banner as historical.

---

## 10. Post-processing

With `WANT_POST` on, the scene renders into a half-float `WebGLRenderTarget` (2× MSAA
on high quality) and `renderPost()` (`4017`) runs a hand-rolled bloom + composite
chain:

```
scene RT ──bright(thr .86, knee .50)──→ L0
   L0 ─blur H─ blur V─→ L0 ──up──→ L1 ─blur H─blur V─→ L1 ──up──→ L2 … L3
                                    (4 levels, each half the previous)
   then additively upsampled back down L3→L2→L1→L0 at 0.52
scene RT + L0 ──comp──→ default framebuffer
```

The composite fragment shader (`3977-4008`) does, in order:

1. radial **chromatic aberration**, strength `(0.30 + r²·2.6)·0.0013`;
2. adds bloom at `uBloom = 0.34`;
3. exposure `uExp = 0.62`, then **ACES** tone mapping;
4. saturation `uSat = 1.05`;
5. **split-toning** — teal in the shadows (×0.74, 1.03, 1.11 ramped in below L=0.55),
   warm in the highlights (×1.035, 0.995, 0.968 above L=0.50);
6. vignette;
7. hash grain at `uGrain = 0.020`, animated by `uT`;
8. `uFade` — the 700 ms fade-in from the preloader;
9. gamma encode, then a small contrast curve **applied after the encode**, pivoted low
   at 0.30. In linear the same curve mostly crushes the shadows, and this frame is
   nearly all shadow.

Card blits land in the scene target *before* this chain, which is why the in-card views
carry the same grade as the world around them.

---

## 11. The main loop

`frame(now)` (`4669`) each tick:

1. `dt = min(raw, 0.05)` — animation never jumps after a tab switch, but the governor
   reads the untruncated value.
2. **Performance governor** (after 2.2 s, unless `?adapt=0`): averages frame time over
   40 frames or 0.9 s; above 23 ms it scales the pixel ratio down (×0.85, or ×0.64 if
   the average is past 50 ms) to a floor of 0.55; below 13.8 ms it walks back up in
   0.08 steps to 1.0. The scene is fill-bound — five big alpha-blended veils plus a
   bloom chain — so pixels are the only knob worth turning on unknown hardware.
3. `RIG.prog` / `RIG.smooth` / pointer damping / intro ramp.
4. `applyCamera()` → `updateWorld(dt)` → `render()`.
5. `queue()` — `requestAnimationFrame`, or `setTimeout(16)` under `?driver=timer`.

`updateWorld` (`4597`) is the per-frame animation budget: lantern flicker (each lamp on
its own frequency), hall halo and moon halo breathing, haze slide, ripple cycles,
wordmark reveal and dissolve, foreground dissolve, leaves, wisps, card hover push. A
`RIG.focusAmt` value — set by hovering a hero chip or a curriculum row — warms the
lanterns by 55 % and swells the halos, which is the page's one direct
DOM-drives-the-scene interaction.

`render()` (`4655`) is deliberately short: bind the scene target, draw the world, draw
the cards into the same target, unbind, run post.

Rendering pauses entirely on `visibilitychange` and restarts with a fresh `tPrev`.

---

## 12. Boot and failure

`boot()` (`4750`) wires the DOM first — grain, reveals, foreground stages, nav, hero
exit, focus, cursor — locks the body, then walks a list of twelve named jobs one per
`setTimeout(16)`, updating the preloader bar and percentage after each:

| # | Label | Work |
|---:|---|---|
| 1 | Reading the type | `document.fonts.load` for the wordmark face |
| 2 | Pouring the ground | `initGL`, `buildRig`, `buildLights` |
| 3 | Cutting the approach | `buildShell` |
| 4 | Raising the hall | `buildTemple` |
| 5 | Hanging the moon | `buildMoon` |
| 6 | Setting the gate | `buildTorii` |
| 7 | Placing the stones | rocks and six lanterns |
| 8 | Growing the maples | five maples |
| 9 | Painting the near grass | `buildForeground` |
| 10 | Cutting the word | `buildWordmark` |
| 11 | Raising the mist | atmosphere, leaf fall, wisps |
| 12 | Polishing the water | `initPost`, cards, cloth, layer assignment, bake shadow, `layoutWord`, `measure` |

The staggering is what makes the progress bar honest — each job is a real frame of
work, and the label names it.

**Failure path.** Jobs are wrapped in `try`; a throw is logged. If it came from job 1
or 2 — no renderer, no scene — `fallback(err)` runs: `no-webgl` classes go on `<html>`
and `<body>`, the body unlocks, the preloader dismisses, every reveal is force-applied,
and `window.__kage = {fallback: true, error}` records why. The stylesheet has a matching
`.no-webgl` branch (`354-388`) that turns the scene into a gradient and adds a scrim
under the hero so the type still has something to sit on. The page stays a page.

`?nogl=1` triggers exactly this path deliberately.

`start()` (`4784`) then binds resize/orientation/visibility, and takes one of two
routes:

* **normal** — dismiss the preloader, unlock after 340 ms, stagger the hero's reveals
  at 95 ms intervals, and stamp `INTRO.t0` to run the opening dolly (under
  `prefers-reduced-motion`, `INTRO.t0` is backdated 4 s so the intro is already over);
* **`?shot=N`** — jump straight to anchor N with the intro complete, the wordmark
  revealed, the fade finished and every reveal applied. Deterministic states for
  review and screenshots.

Either way it publishes `window.__kage` (aliased `window.__secret`) with live handles
to `RIG`, `WORLD`, `WORD`, `CAM`, `POST`, the renderer, scene, camera and an `anchors()`
accessor.

---

## 13. Motion, typography and the page layer

The CSS carries as much of the experience as the WebGL does.

* **Reveals.** `[data-rv="up|fade"]` elements start at opacity 0 and are switched on by
  an `IntersectionObserver` (`rootMargin: 0 0 -10%`, threshold 0.04). Siblings sharing
  a parent are auto-staggered 85 ms apart by `data-rvd`. Hero elements are excluded and
  driven by `start()` instead.
* **Word-level headings.** `splitHeadingWords` (`4170`) rewrites every `h1.display` /
  `h2.display` into per-word masked spans with a 72 ms cascade, sets `aria-label` to
  the original phrase on the container and `aria-hidden` on the visual words, so the
  accessible name is unchanged. Skipped entirely under reduced motion.
* **Hero exit.** `wireHeroExit` (`4290`) is a scroll-driven sequencer over the first
  58 % of a viewport height. Each element has an `at`/`span` window: preview at 0.00
  (fast, and blurred 10 px rather than merely dimmed, because it is the largest
  flattest thing in frame and a slow fade just dims it in place), cue at 0.10, the four
  chips at 0.20 + 0.10·i, the chip container at 0.60, the side title at 0.70. Inline
  `transition: none` is written first, or the reveal's own 0.9 s opacity transition
  would make the fade trail the scroll by most of a second. Everything is handed back
  the moment scroll returns to zero.
* **Nav.** Sticks past 40 px, hides on downward scroll past 80 % of a viewport (never
  while the mobile sheet is open). Active-link matching reads each link's `href` and
  resolves it to a section index — the older positional rule silently assumed one link
  per section in matching order, and with five links over four chapters every entry
  past the third lit for its neighbour.
* **Layout variants.** `<body>` carries `data-layout-hero`, `-story`, `-gallery`,
  `-curriculum`, `-closing`, `-footer`, all set to `"b"`. The stylesheet's "B set"
  (`517-638`) is a complete alternative composition — split hero, spread story, mosaic
  gardens, atlas chapters, gallery closing, manifesto footer — selected by those
  attributes. The A set is the plainer baseline the B rules override.
* **Reduced motion** is honoured in three places at once: CSS (`350`, `805`, `879`),
  the reveal delays, and the rig (undamped camera, no intro, immediate foreground
  parking). The complete reading experience survives.
* **Responsive** breakpoints at 1080 px, 820 px (nav collapses to a sheet, preview
  window hidden) and 560 px.

---

## 14. Performance budget, in one table

| Technique | Where | Why |
|---|---|---|
| Adaptive pixel ratio, 0.55–1.0 | `frame` governor | the scene is fill-bound, not vertex-bound |
| MSAA dropped first | `resize` | cheapest quality to lose |
| Merged stair/cheek geometry | `buildShell` | 120 draw calls → 2 |
| Shared texture library (`LIB`) | module 4 | six lanterns, one granite |
| Baked shadow map | job 12 | nothing that casts a shadow moves |
| Card render rota (1-in-24) | `renderCards` | the in-card views are static |
| Card opacity culling | `cardAlpha` | never draw behind faded DOM |
| GPU-side particle motion | embers, rain | zero per-frame CPU cost |
| Camera-anchored leaf recycling | `updateLeaves` | 260 leaves all in frame instead of a dozen |
| Cloth stops when settled or off-screen | `createCloth` | 3 × 96² cells is the page's heaviest loop |
| `LOW` quality tier | throughout | coarse pointers default to it: no rain, halved particles, 1024² shadows |
