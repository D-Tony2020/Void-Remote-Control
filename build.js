const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const SRC = path.join(__dirname, 'src');
const NODE_MODULES = path.join(__dirname, 'node_modules');

function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Clean and create dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// Copy source files
copyRecursive(SRC, DIST);

// Copy MediaPipe vision bundle
const visionDir = path.join(NODE_MODULES, '@mediapipe', 'tasks-vision');
const libsDir = path.join(DIST, 'libs');
fs.mkdirSync(libsDir, { recursive: true });

// Copy the main JS bundle
const bundleSrc = path.join(visionDir, 'vision_bundle.mjs');
if (fs.existsSync(bundleSrc)) {
  fs.copyFileSync(bundleSrc, path.join(libsDir, 'vision_bundle.mjs'));
} else {
  console.error('ERROR: vision_bundle.mjs not found. Run npm install first.');
  process.exit(1);
}

// Copy WASM files
const wasmSrcDir = path.join(visionDir, 'wasm');
const wasmDestDir = path.join(libsDir, 'wasm');
if (fs.existsSync(wasmSrcDir)) {
  copyRecursive(wasmSrcDir, wasmDestDir);
} else {
  console.error('ERROR: WASM directory not found. Run npm install first.');
  process.exit(1);
}

console.log('Build complete! Extension assembled in dist/');
console.log('Load dist/ as an unpacked extension in chrome://extensions');
