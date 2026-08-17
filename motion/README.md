# Motion — keyable overlays

Three motion-graphics compositions and an offline renderer that turns them into
files you can drop straight on a Premiere timeline with a real alpha channel.

```
motion/
├── index.html    the engine, the three comps, and a scrub preview
├── render.mjs    the offline renderer  (Playwright → PNG → ffmpeg)
└── out/          rendered files (git-ignored)
```

| Comp | What it is | Default length |
|---|---|---:|
| `sting` | Title card / logo open — rules strike out, the wordmark rises out of a mask a letter at a time, a sweep of light crosses it | 5.0 s |
| `kinetic` | Kinetic captions — lines land on their own beat and push the stack upward, older lines dimming | 8.0 s |
| `data` | Animated bar comparison — bars grow, figures count, the baseline draws itself | 7.0 s |

## Preview

Open `index.html` in a browser. Nothing to install.

Scrub the timeline, switch comps, and — the part that matters for overlays —
switch the backdrop. **Alpha** shows the checkerboard, **Plate** stands in for
footage. If a graphic looks right on black but lifts a grey box on Plate, the
matte is wrong and you'd only find out in the edit.

`Blur ×6` turns on sub-frame motion blur so you can see it before committing to
a render.

## Render

```bash
npm install playwright ffmpeg-static
npx playwright install chromium

node render.mjs --comp sting
node render.mjs --comp data --fps 60 --samples 6
node render.mjs --comp kinetic --w 3840 --h 2160 --format png
```

| Option | Default | |
|---|---|---|
| `--comp` | `sting` | `sting` · `kinetic` · `data` |
| `--format` | `prores` | see the table below |
| `--fps` | `30` | |
| `--w` `--h` | the comp's own | any size; the layout scales off frame width |
| `--samples` | `1` | motion-blur sub-frames per output frame; `1` is off |
| `--shutter` | `0.55` | shutter angle as a fraction of a frame |
| `--dur` | the comp's own | override the length in seconds |
| `--out` | `out/<comp>.<ext>` | |
| `--keep-frames` | off | keep the PNG sequence after encoding |

### Formats

| `--format` | Codec | Alpha | Use it for |
|---|---|:--:|---|
| `prores` | ProRes 4444, `yuva444p10le` | ✅ | the default — what you want for Premiere / Resolve |
| `rle` | QuickTime Animation | ✅ | lossless, much larger, older-app friendly |
| `webm` | VP9 `yuva420p` | ✅ | web overlays |
| `png` | PNG sequence | ✅ | maximum quality, or hand-off to another tool |
| `mp4` | H.264 | ❌ | full-frame, opaque over black — **not** an overlay |

Plain `prores` silently drops the alpha channel; `yuva444p10le` is what actually
makes it keyable, which is why the profile is pinned rather than left to ffmpeg.

Each render writes a `<comp>.render.json` beside the output with every setting
used, so a re-render months later lands on the same numbers.

## In Premiere

Import the `.mov` and drop it on a track above your footage — the alpha is
straight (unmatted), so it keys with no interpretation step.

For glows specifically, set the clip's blend mode to **Screen** and the light
behaves like light rather than like a decal. It composites correctly either way;
Screen just reads better over bright footage.

## Editing a comp

Everything is at the top of its section in `index.html`.

**Title card** — three strings:

```js
var STING = {
  eyebrow: 'EST. 2019 — PORTLAND, OR',
  title:   "MIKE'S",
  sub:     'Five honest things, and fire.'
};
```

**Captions** — a line, a beat in seconds, and optionally which word takes the
accent colour. Retime the whole piece by editing one column of numbers:

```js
var SCRIPT = [
  { t: 0.20, text: 'Nothing here is modelled.' },
  { t: 3.20, text: 'at load, from noise.', hot: 'noise.' }
];
```

**Data** — the comp is a function of this object, so different numbers are a
different render rather than a different build:

```js
var DATA = {
  eyebrow: 'MEASURED — COLD START, 1920×1080',
  title: 'Time to first frame',
  unit: 'ms',
  rows: [ { label: 'Procedural, one file', value: 34, hot: true }, … ]
};
```

Colours live in `PAL`, type in `SANS` / `SERIF`. Sizes are all multiples of
`k = frameWidth / 1920`, so a comp laid out once works at any resolution.

## How it works, and why it's built this way

**Every frame is a pure function of `t`.** Nothing accumulates, nothing reads
the wall clock, nothing calls `Math.random()` unseeded. Ask for `t = 2.318`
twice and you get identical pixels.

That single constraint is what buys everything else:

- **Frame-exact rendering.** The renderer steps the clock by exactly `1/fps` and
  screenshots. It never races the browser's frame loop, so output does not
  depend on how fast the machine is.
- **Retakes.** Change one number, re-render frames 40–80, splice.
- **Motion blur.** Because you can ask the scene for *any* instant — including
  between frames — sub-frame sampling is free. `--samples 6` renders six
  sub-frames per output frame and averages them.

The timeline primitive is `seg(t, at, dur, ease)`: a window on the clock, 0
before `at`, 1 after `at + dur`, eased between. Every animation here is built
from those, which is why there's no tween library and no state machine — a
value at any `t` is computed, never stepped.

### Two details that are easy to get wrong

**Averaging for motion blur.** Canvas composites in premultiplied space, so
drawing each sub-frame with `globalAlpha = 1/N` under `'lighter'` sums
premultiplied colour *and* coverage — which is exactly the premultiplied
average, and therefore the right answer for straight-alpha output. No pixel
loop, no unpremultiply step.

**The glow has to be luminance-weighted.** The bright pass is the source image
itself, blurred. An earlier version filled flat white through `'source-in'`,
which keys on *coverage* rather than luminance — so drop shadows and dimmed
back-catalogue lines bloomed as hard as white type, and a wide blur turned a
block of captions into one glowing rectangle sitting on the footage. Radii stay
tight for the same reason: past roughly 2.5% of frame width, spill stops reading
as light on type and starts reading as a lifted box.

### Why Canvas 2D and not WebGL

These are overlays composited over footage nobody has shot yet, so the
background is genuinely nothing — and WebGL is bad at *nothing*. An additive
pass over a transparent clear leaves a halo whose alpha is wrong, and the edges
go dark on the timeline. Canvas `'lighter'` sums coverage along with colour, so
a glow carries its own alpha and keys correctly for free.

Text is the other reason: canvas glyphs stay crisp at any output resolution,
where a WebGL text atlas has to be re-rasterised per size.

Type over unknown footage carries its own contrast — every glyph gets a soft
dark spread (`shadow()`) so it reads on a white sky as well as a night interior.
One trap: a canvas shadow is clipped by whatever clip is in force, so setting
one inside a mask stamps the mask's rectangle into the alpha. Masking happens
inside `layer()` and the shadow is applied to the assembled result on the way
out.

## Adding a comp

```js
COMPS.mything = {
  w: 1920, h: 1080, dur: 6.0, glow: .3,
  draw: function (c, t, S) {
    var k = S.w / 1920;
    var a = seg(t, .4, .8, E.outExpo);      // fade/rise window
    c.save();
    c.globalAlpha = a;
    shadow(c, 24 * k, .6);
    c.font = '500 ' + (60 * k) + 'px ' + SANS;
    c.fillStyle = PAL.bone;
    c.fillText('hello', 200 * k, 500 * k + (1 - a) * 20 * k);
    c.restore();
  }
};
```

It appears in the preview dropdown and as a `--comp` value automatically.

`draw()` may be called for any `t`, in any order, more than once per frame — so
it must never mutate anything outside its own scope. That's the one rule.

## Notes

- Fonts load from Google Fonts. The renderer waits on `document.fonts.ready`
  before the first frame; with no network it falls back to Georgia and
  system-ui, which changes the look but not the timing.
- Render time is roughly 0.13 s/frame at 960×540 and scales with pixel count
  and `--samples`. A 5 s 1080p sting at 30 fps takes a couple of minutes.
- The renderer serves the page over localhost rather than `file://`, because
  font loading and canvas security rules differ across platforms on `file://`.
