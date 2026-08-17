#!/usr/bin/env node
/* =====================================================================
   Offline renderer for the compositions in index.html.

   The scene is a pure function of t, so rendering is just: step the clock
   by exactly 1/fps, screenshot, repeat. Nothing here races the browser's
   frame loop and nothing depends on how fast the machine is — render the
   same comp twice and the files are byte-identical.

   Alpha survives the whole way: Playwright's omitBackground gives a
   straight-alpha PNG, and the encoders below are the ones that can carry
   it (ProRes 4444, QuickTime RLE, VP9). H.264 cannot — ask for mp4 and
   you get an opaque file over black, which is what you want for a full
   frame and useless for an overlay.

   Usage
     node render.mjs --comp sting
     node render.mjs --comp data --fps 60 --format prores --samples 6
     node render.mjs --comp kinetic --w 3840 --h 2160 --format png

   Options
     --comp     sting | kinetic | data           (default sting)
     --format   prores | rle | webm | mp4 | png  (default prores)
     --fps      frames per second                (default 30)
     --w --h    output size                      (default the comp's own)
     --samples  motion-blur sub-frames, 1 = off  (default 1)
     --shutter  shutter angle as a fraction      (default 0.55)
     --dur      override duration in seconds
     --out      output path
   ===================================================================== */

import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------ options */
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const flag = k => argv.includes('--' + k);

const COMP    = arg('comp', 'sting');
const FORMAT  = arg('format', 'prores');
const FPS     = parseFloat(arg('fps', '30'));
const SAMPLES = parseInt(arg('samples', '1'), 10);
const SHUTTER = parseFloat(arg('shutter', '0.55'));
const DUR_IN  = arg('dur', null);
const KEEP    = flag('keep-frames');

if (!['prores', 'rle', 'webm', 'mp4', 'png'].includes(FORMAT)) {
  console.error(`unknown --format "${FORMAT}"`);
  process.exit(1);
}

/* ------------------------------------- a static server for the page ---- */
/* file:// URLs make Playwright's font loading and canvas security rules
   inconsistent across platforms; a two-line server sidesteps all of it. */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
function serve(dir) {
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(dir, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch { res.writeHead(404).end('not found'); }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

/* ---------------------------------------------------------- encoders --- */
/* Only the first three carry an alpha channel. yuva444p10le is the pixel
   format that actually makes ProRes 4444 keyable — plain prores silently
   drops the alpha and you find out in the edit. */
const ENCODE = {
  prores: { ext: 'mov',  args: ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0'], alpha: true },
  rle:    { ext: 'mov',  args: ['-c:v', 'qtrle', '-pix_fmt', 'argb'], alpha: true },
  webm:   { ext: 'webm', args: ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24', '-auto-alt-ref', '0'], alpha: true },
  mp4:    { ext: 'mp4',  args: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow'], alpha: false }
};

const run = (bin, args) => new Promise((resolve, reject) => {
  const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  p.on('close', code => code === 0 ? resolve() : reject(new Error(err.split('\n').slice(-14).join('\n'))));
});

/* ---------------------------------------------------------------- go --- */
const { srv, port } = await serve(HERE);
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 320, height: 240 } });
  page.on('pageerror', e => { throw new Error('page error: ' + e.message); });

  /* load once with no size override so the comp can report its own */
  const probeURL = `http://127.0.0.1:${port}/?render=1&comp=${COMP}&fps=${FPS}`;
  await page.goto(probeURL, { waitUntil: 'load' });
  await page.evaluate(() => window.MG.ready);
  const meta = await page.evaluate(() => window.MG.info());

  const W = parseInt(arg('w', meta.w), 10);
  const H = parseInt(arg('h', meta.h), 10);
  const DUR = DUR_IN ? parseFloat(DUR_IN) : meta.dur;
  const FRAMES = Math.round(DUR * FPS);

  /* reload at the real size — the comp scales off canvas width, so this
     has to be set before the first frame rather than patched afterwards */
  const url = `http://127.0.0.1:${port}/?render=1&comp=${COMP}&w=${W}&h=${H}` +
              `&fps=${FPS}&samples=${SAMPLES}&shutter=${SHUTTER}`;
  await page.setViewportSize({ width: W, height: H });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => window.MG.ready);
  /* one settling frame: fonts can resolve a tick after ready on first paint */
  await page.waitForTimeout(250);

  const spec = ENCODE[FORMAT];
  const outPath = path.resolve(arg('out',
    FORMAT === 'png' ? path.join(HERE, 'out', COMP) : path.join(HERE, 'out', `${COMP}.${spec.ext}`)));
  const frameDir = FORMAT === 'png' ? outPath : path.join(HERE, 'out', `.frames-${COMP}`);

  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });
  if (FORMAT !== 'png') await mkdir(path.dirname(outPath), { recursive: true });

  console.log(`${COMP} · ${W}×${H} · ${FPS}fps · ${DUR}s · ${FRAMES} frames` +
              (SAMPLES > 1 ? ` · ${SAMPLES}× motion blur` : '') +
              `\nformat ${FORMAT}${spec && !spec.alpha ? ' (no alpha — opaque over black)' : ' (alpha)'}`);

  const stage = page.locator('#stage');
  const t1 = Date.now();
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FPS;
    /* the one line the whole design is for: ask for an exact instant */
    await page.evaluate(tt => window.MG.seek(tt), t);
    await stage.screenshot({
      path: path.join(frameDir, String(f).padStart(5, '0') + '.png'),
      omitBackground: true                       /* straight alpha, unmatted */
    });
    if (f % 20 === 0 || f === FRAMES - 1) {
      process.stdout.write(`\r  frame ${f + 1}/${FRAMES}`.padEnd(28));
    }
  }
  process.stdout.write(`\r  ${FRAMES} frames in ${((Date.now() - t1) / 1000).toFixed(1)}s`.padEnd(34) + '\n');

  if (FORMAT === 'png') {
    console.log(`→ ${outPath}/  (PNG sequence, straight alpha)`);
  } else {
    await run(ffmpegPath, [
      '-y', '-framerate', String(FPS),
      '-i', path.join(frameDir, '%05d.png'),
      ...spec.args, '-r', String(FPS), outPath
    ]);
    if (!KEEP) await rm(frameDir, { recursive: true, force: true });
    console.log(`→ ${outPath}`);
  }

  /* a sidecar so a re-render months later lands on the same numbers */
  await writeFile(path.join(path.dirname(outPath), `${COMP}.render.json`),
    JSON.stringify({ comp: COMP, w: W, h: H, fps: FPS, dur: DUR, frames: FRAMES,
                     samples: SAMPLES, shutter: SHUTTER, format: FORMAT }, null, 2));
} finally {
  await browser.close();
  srv.close();
}
