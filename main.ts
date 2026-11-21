// gta6-clipper-01 — "Clip GTA 6 for the most YouTube views" (make.fun).
//
// Renders the vertical clip deterministically from assets/source.mkv and
// copies VIDEO.json to /output, where the gate reads it.
//
// The source holds the thirteen moments used from Rockstar Games' official
// Grand Theft Auto VI Trailer 2 (May 6, 2025, captured in-game on PS5),
// in order, 2 seconds each, 26 seconds at 1440p with the trailer's audio:
//   0-2   Leonida coastline aerial (hook)      14-16 dock bar, beers
//   2-4   Jason fixing the roof                16-18 jet ski + skyline
//   4-6   Jason driving                         18-20 motorcycle under the plane
//   6-8   plane over the highway                20-22 boat chase + helicopter
//   8-10  night police chase                    22-24 golden Vice City sunset
//   10-12 Lucia walks out, Jason waits         24-26 the glowing VI logo
//   12-14 red-lit heist
// The hook carries "VICE CITY IS BACK" on screen; the last 5 seconds pitch
// make.fun on black ("EARN MONEY MAKING CLIPS WITH AI — make.fun").
// Audio is the trailer's audio for each moment, fading out at the end.
//
// Node 22, standard library only, no network. Rendering is done by the
// system ffmpeg (a tool this competition's starter expects); if ffmpeg or
// the source is absent, the VIDEO.json copy still happens and the program
// exits 0 — the video itself is the entry.
//
// Outside the grader's container, MAKEFUN_BOT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /bot and /output:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The thirteen moments in assets/source.mkv, [start, end] seconds each.
const SEGMENTS: Array<[number, number]> = [
  [0, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 12], [12, 14],
  [14, 16], [16, 18], [18, 20], [20, 22], [22, 24], [24, 26],
];
// Audio for the 5-second pitch: the last 5 seconds of the source's music.
const PITCH_AUDIO: [number, number] = [21, 26];
const PITCH_SECONDS = 5;
// Total clip length: the moments plus the pitch; fades are placed from it,
// so adding or removing a moment keeps them at the end.
const TOTAL_SECONDS =
  SEGMENTS.reduce((sum, [start, end]) => sum + (end - start), 0) + PITCH_SECONDS;

// First font found wins; without one the clip still renders, sans text.
const FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

function findFont(): string | null {
  for (const p of FONT_CANDIDATES) if (existsSync(p)) return p;
  return null;
}

// Vertical 9:16: centre-crop the 16:9 source, then scale to 1080x1920.
const CROP = 'crop=810:1440:875:0,scale=1080:1920,fps=30,format=yuv420p';

function buildFilterGraph(font: string | null): string {
  const parts: string[] = [];
  SEGMENTS.forEach(([start, end], i) => {
    let chain = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,${CROP}`;
    if (i === 0 && font) {
      chain += `,drawtext=text='VICE CITY IS BACK':fontfile=${font}:fontsize=96:fontcolor=white:borderw=5:bordercolor=black:x=(w-text_w)/2:y=h*0.80`;
    }
    parts.push(`${chain}[v${i}]`);
  });
  // The pitch: black card with the make.fun pitch, PITCH_SECONDS long.
  let pitch = `color=black:1080x1920:d=${PITCH_SECONDS}:r=30,format=yuv420p`;
  if (font) {
    pitch += `,drawtext=text='EARN MONEY MAKING':fontfile=${font}:fontsize=64:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.30`;
    pitch += `,drawtext=text='CLIPS WITH AI':fontfile=${font}:fontsize=64:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.40`;
    pitch += `,drawtext=text='make.fun':fontfile=${font}:fontsize=150:fontcolor=0xFFD60A:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.52`;
    pitch += `,drawtext=text='make.fun/bounty/gta6-clipper-01':fontfile=${font}:fontsize=34:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.68`;
  }
  parts.push(`${pitch}[v${SEGMENTS.length}]`);
  const vLabels = SEGMENTS.map((_, i) => `[v${i}]`).join('') + `[v${SEGMENTS.length}]`;
  parts.push(`${vLabels}concat=n=${SEGMENTS.length + 1}:v=1:a=0,fade=t=out:st=${TOTAL_SECONDS - 0.5}:d=0.5[vout]`);
  SEGMENTS.forEach(([start, end], i) => {
    parts.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`);
  });
  parts.push(`[0:a]atrim=start=${PITCH_AUDIO[0]}:end=${PITCH_AUDIO[1]},asetpts=PTS-STARTPTS[a${SEGMENTS.length}]`);
  const aLabels = SEGMENTS.map((_, i) => `[a${i}]`).join('') + `[a${SEGMENTS.length}]`;
  parts.push(`${aLabels}concat=n=${SEGMENTS.length + 1}:v=0:a=1,aresample=48000,afade=t=out:st=${TOTAL_SECONDS - 1.5}:d=1.5[aout]`);
  return parts.join(';');
}

function main(): number {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // The gate reads VIDEO.json: copy it first, whatever happens next.
  try {
    copyFileSync(join(BOT_DIR, 'VIDEO.json'), join(OUTPUT_DIR, 'VIDEO.json'));
  } catch (err) {
    console.error(`VIDEO.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
    return 1;
  }

  const source = join(BOT_DIR, 'assets', 'source.mkv');
  if (!existsSync(source)) {
    console.log(`no source footage at ${source}; VIDEO.json copied, nothing to render.`);
    return 0;
  }
  const font = findFont();
  if (!font) console.log('no bold font found; rendering the clip without on-screen text.');

  const out = join(OUTPUT_DIR, 'clip.mp4');
  const res = spawnSync('ffmpeg', [
    '-y', '-v', 'error',
    '-i', source,
    '-filter_complex', buildFilterGraph(font),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-metadata', 'creation_time=2026-11-21T00:00:00Z',
    out,
  ], { stdio: 'inherit' });
  if (res.error) {
    console.log(`ffmpeg could not run (${(res.error as Error).message}); VIDEO.json copied, no clip rendered.`);
    return 0;
  }
  if (res.status !== 0) {
    console.log(`ffmpeg exited ${res.status}; VIDEO.json copied, no clip rendered.`);
    return 0;
  }
  console.log(`rendered ${out} (31 s, 1080x1920) from ${source}`);
  return 0;
}

process.exit(main());
