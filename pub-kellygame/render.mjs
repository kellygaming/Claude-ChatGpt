// Rendu de la pub en MP4 : chaque image est calculée par render(t) puis capturée.
// Usage : node render.mjs [sortie.mp4] [fps]
//         node render.mjs --stills 2,7,13   (captures PNG de contrôle)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const stillsIdx = args.indexOf('--stills');

const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(dir, 'index.html')).href + '#capture');
await page.evaluate(() => window.ready);

const shot = async (t, type = 'jpeg') => {
  await page.evaluate((tt) => window.render(tt), t);
  return page.screenshot({ type, quality: type === 'jpeg' ? 95 : undefined });
};

if (stillsIdx !== -1) {
  const outDir = path.join(dir, 'stills');
  fs.mkdirSync(outDir, { recursive: true });
  for (const t of args[stillsIdx + 1].split(',').map(Number)) {
    fs.writeFileSync(path.join(outDir, `t${t.toFixed(1)}.png`), await shot(t, 'png'));
  }
  await browser.close();
  process.exit(0);
}

const out = path.resolve(args[0] || path.join(dir, 'kellygame-pub-1080p.mp4'));
const fps = Number(args[1] || 30);
const duration = await page.evaluate(() => window.DURATION);
const frames = Math.round(duration * fps);

const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', out,
], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let i = 0; i < frames; i++) {
  const buf = await shot(i / fps);
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % fps === 0) process.stdout.write(`\r${i}/${frames} images`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(`\nOK → ${out}`);
