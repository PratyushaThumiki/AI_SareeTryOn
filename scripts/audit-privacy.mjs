#!/usr/bin/env node
/**
 * Privacy audit script.
 *
 * Searches the compiled source for patterns that would indicate accidental
 * camera-data exfiltration. Run with `npm run audit:privacy`.
 *
 * Exit code:
 *   0 — no suspicious patterns found
 *   1 — at least one pattern matched; review the output
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const SEARCH_DIRS = ['src', 'app'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

// Patterns that would indicate camera data leaving the device.
const PATTERNS = [
  { label: 'toDataURL (canvas export to base64)', re: /\.toDataURL\s*\(/ },
  { label: 'toBlob (canvas export to blob)', re: /\.toBlob\s*\(/ },
  { label: 'MediaRecorder (records video stream)', re: /new\s+MediaRecorder\s*\(/ },
  { label: 'captureStream (video stream from canvas)', re: /\.captureStream\s*\(/ },
  { label: 'fetch with FormData that might carry image', re: /fetch\s*\(.*FormData/ },
  { label: 'XMLHttpRequest send with blob', re: /\.send\s*\(\s*(blob|Blob|imageBlob|videoBlob)/ },
  { label: 'base64 camera image in API call', re: /data:image.*fetch/ },
  { label: 'ImageCapture API (high-res still from video)', re: /new\s+ImageCapture\s*\(/ },
  { label: 'WebCodecs VideoFrame encoded and sent', re: /VideoEncoder/ },
];

// Allow-list: these files are explicitly allowed to reference the patterns
// above because they are the guard/test infrastructure themselves, OR because
// the usage has been manually verified as local-only (no network send).
const ALLOW_LIST = [
  'tests/privacy.test.ts',
  'src/components/dev/NetworkGuard.tsx',
  'scripts/audit-privacy.mjs',
  // TryOnScreen.takeSnapshot uses toDataURL to build a data-URI that is
  // assigned to state and used exclusively as:
  //   (a) <img src> for a local preview
  //   (b) <a download href> for a browser-native save dialog
  // Grep for `snapshotUrl` confirms it never reaches fetch/XHR/WS.
  'src/components/tryon/TryOnScreen.tsx',
];

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') {
      yield* walk(full);
    } else if (e.isFile() && EXTENSIONS.has(extname(e.name))) {
      yield full;
    }
  }
}

const ROOT = process.cwd();
let violations = 0;

for await (const file of walk(ROOT)) {
  const rel = file.replace(ROOT + '/', '').replace(ROOT + '\\', '');
  if (ALLOW_LIST.some((a) => rel.replace(/\\/g, '/').includes(a))) continue;

  const content = await readFile(file, 'utf-8');
  for (const { label, re } of PATTERNS) {
    const match = re.exec(content);
    if (match) {
      console.error(`\n⛔ MATCH: ${label}`);
      console.error(`   File : ${rel}`);
      console.error(`   Match: ${match[0].trim()}`);
      violations++;
    }
  }
}

if (violations === 0) {
  console.log('✅ Privacy audit passed — no suspicious patterns found.');
  process.exit(0);
} else {
  console.error(`\n❌ Privacy audit found ${violations} suspicious pattern(s). Review above.`);
  process.exit(1);
}
