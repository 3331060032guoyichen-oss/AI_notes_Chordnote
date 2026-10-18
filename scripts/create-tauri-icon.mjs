/**
 * Generate the Windows application icon from the product's existing dark and
 * purple palette plus the shared harp motif. The ICO uses a 32-bit DIB, so no
 * image-conversion dependency or external asset is required.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "src-tauri", "icons", "icon.ico");
const size = 256;
const pixels = new Uint8Array(size * size * 4);

function setPixel(x, y, red, green, blue, alpha = 255) {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  if (roundedX < 0 || roundedX >= size || roundedY < 0 || roundedY >= size) return;
  const index = (roundedY * size + roundedX) * 4;
  pixels[index] = red;
  pixels[index + 1] = green;
  pixels[index + 2] = blue;
  pixels[index + 3] = alpha;
}

function disk(cx, cy, radius, color) {
  const startX = Math.floor(cx - radius);
  const endX = Math.ceil(cx + radius);
  const startY = Math.floor(cy - radius);
  const endY = Math.ceil(cy + radius);
  const radiusSquared = radius * radius;

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radiusSquared) setPixel(x, y, ...color);
    }
  }
}

function line(x1, y1, x2, y2, width, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    disk(x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio, width / 2, color);
  }
}

const ink = [3, 7, 18, 255];
const violet = [124, 58, 237, 255];
const paper = [248, 250, 252, 255];

disk(128, 128, 120, ink);
for (let radius = 120; radius >= 116; radius -= 1) {
  for (let angle = 0; angle < Math.PI * 2; angle += 0.003) {
    setPixel(128 + Math.cos(angle) * radius, 128 + Math.sin(angle) * radius, ...violet);
  }
}

// Same geometry as the in-app AgentFigure: board, neck, pillar, bridge, strings, and core.
line(83, 194, 79, 99, 7, paper);
line(79, 99, 183, 54, 8, paper);
line(183, 54, 183, 194, 7, paper);
line(83, 194, 183, 194, 8, paper);
line(96, 92, 88, 165, 5, violet);
line(126, 78, 90, 181, 6, violet);
line(155, 65, 94, 194, 5, violet);
disk(120, 92, 10, violet);

const xorBytes = size * size * 4;
const andMaskStride = Math.ceil(size / 32) * 4;
const imageBytes = 40 + xorBytes + andMaskStride * size;
const ico = Buffer.alloc(6 + 16 + imageBytes);
ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 0;
ico[7] = 0;
ico[8] = 0;
ico[9] = 0;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(imageBytes, 14);
ico.writeUInt32LE(22, 18);

const bitmapOffset = 22;
ico.writeUInt32LE(40, bitmapOffset);
ico.writeInt32LE(size, bitmapOffset + 4);
ico.writeInt32LE(size * 2, bitmapOffset + 8);
ico.writeUInt16LE(1, bitmapOffset + 12);
ico.writeUInt16LE(32, bitmapOffset + 14);
ico.writeUInt32LE(0, bitmapOffset + 16);
ico.writeUInt32LE(xorBytes, bitmapOffset + 20);

const xorOffset = bitmapOffset + 40;
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const source = (y * size + x) * 4;
    const target = xorOffset + ((size - 1 - y) * size + x) * 4;
    ico[target] = pixels[source + 2];
    ico[target + 1] = pixels[source + 1];
    ico[target + 2] = pixels[source];
    ico[target + 3] = pixels[source + 3];
  }
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, ico);
console.log(`Tauri icon generated at ${output}`);
