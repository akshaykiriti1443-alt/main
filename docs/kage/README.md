# Kage — technical documentation

Documentation for **Kage**, Meng To's single-file WebGL experience: an interactive
five-chapter night walk through a fictional Kyoto mountain temple, rendered live in
Three.js and layered with generated cinematic imagery.

| | |
|---|---|
| Live site | <https://mengto.github.io/kage/> |
| Source | <https://github.com/MengTo/kage> |
| Documented at commit | `4399487d2fb42bce39c7b032fbbb50d230bf4f0b` (2026-08-09, *"Stop the sections widening the page"*) |
| Runtime | Three.js **r149**, vendored. No build step, no framework, no package manager |
| Payload | `index.html` 244 KB · three.min.js 596 KB · fonts 100 KB · imagery 2.6 MB |

## What this documentation is

Kage ships with two documents of its own: a `README.md` that says what the page is,
and a `PROMPT.md` that is the portable brief for rebuilding it. Neither describes how
the 3 600 lines of JavaScript inside `index.html` are actually organised.

That gap is what these pages fill. They are a **reader's map of the source**: which
module owns what, how the scroll position becomes a camera position, how DOM elements
and the WebGL canvas are stitched into one composite frame, and which constants you
change to move something.

Read them alongside a checkout of the upstream repository:

```bash
git clone https://github.com/MengTo/kage.git
cd kage
python3 -m http.server 4173 --bind 127.0.0.1
# → http://127.0.0.1:4173/
```

There is no build step, no environment variable, no analytics and no runtime network
dependency. Python only serves static files; any static server works.

## The documents

| File | What is in it |
|---|---|
| [`architecture.md`](architecture.md) | The full walkthrough — layer model, the fifteen numbered modules, texture pipeline, world construction, camera rig, scroll model, the three DOM↔WebGL bridges, post-processing chain, main loop, boot sequence |
| [`reference.md`](reference.md) | Lookup tables — URL parameters, debug handles, every tunable constant, CSS tokens and layout switches, asset inventory, and "how do I change X" recipes |

## Sixty-second tour

The page is one fixed full-viewport `<canvas>` with an ordinary HTML document
scrolling over it.

1. **Boot.** A preloader runs a list of twelve named build jobs — *"Pouring the
   ground"*, *"Raising the hall"*, *"Hanging the moon"* — one per animation frame,
   driving a progress bar. Every texture in the 3D scene is drawn into a 2-D canvas
   at load time from seeded noise; there are no photographic textures and no model
   files. If the first two jobs throw, the page drops to a WebGL-free reading layout
   and stays perfectly usable.
2. **Scroll becomes camera.** Six sections carry `data-cam="0…5"`. Their scroll
   anchors are measured into a continuous progress value, that value is critically
   damped, and it indexes a Catmull–Rom spline through six hand-composed camera
   waypoints. Sections are shots on one continuous dolly, never scene swaps.
3. **The world is generated.** Podium, forty-riser flight, two-storey Sanmon, torii,
   six stone lanterns, five maples, a vermilion moon, ridgelines, fog, rain, embers,
   drifting maple leaves and six alpha-cutout foreground planes — all built from code
   at runtime against one shared site plan in metres.
4. **DOM and WebGL interleave.** Three garden cards and the hero preview each own a
   private camera; the scene is rendered into a small render target per card and
   blitted back into the composite at that element's screen rectangle, so a live 3D
   view appears to sit *inside* an HTML card. The generated stills on those cards are
   simultaneously simulated as cloth on a 96×96 grid in WebGL2.
5. **One post pass ties it together.** Everything lands in a half-float buffer that
   goes through a four-level bloom pyramid and a single composite shader: chromatic
   aberration, ACES tone map, split-toning, vignette, grain and gamma. That shader is
   the reason the page reads as one photographed image rather than as HTML over 3D.

## Provenance and licensing

Kage is an original, independent design study by Meng To. It is not affiliated with a
specific temple, cultural institution, or tourism organisation. Its scene plates and
foreground artwork were generated with GPT Image 2 and art-directed against the live
scene.

**The upstream repository grants no licence for reuse or redistribution of the Kage
code or artwork**; the vendored Three.js runtime remains MIT. These documents are an
independent technical description written from a public checkout — they describe the
implementation and quote only short factual fragments (constant values, uniform
names) rather than reproducing the source. Nothing here relicenses anything upstream.

Line references are pinned to the commit named above and will drift as the project
changes.
