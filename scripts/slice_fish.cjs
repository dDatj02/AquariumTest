const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const typeAndData = buf.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function encodePNG(width, height, rgbaBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR: 13 bytes
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  
  // Scanlines with filter byte 0 (None)
  const rowBytes = width * 4;
  const rawData = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    const rawOffset = y * (rowBytes + 1);
    rawData[rawOffset] = 0; // Filter: None
    rgbaBuffer.copy(rawData, rawOffset + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  
  const idatData = zlib.deflateSync(rawData, { level: 9 });
  const iendData = Buffer.alloc(0);
  
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', iendData)
  ]);
}

function parsePNG(buffer) {
  let pos = 8; // skip signature
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatParts = [];
  
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  
  const decompressed = zlib.inflateSync(Buffer.concat(idatParts));
  const bpp = colorType === 2 ? 3 : colorType === 6 ? 4 : 3;
  const rowSize = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);
  let srcPos = 0;
  const prevRow = Buffer.alloc(rowSize);
  const currRow = Buffer.alloc(rowSize);
  
  function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }
  
  for (let y = 0; y < height; y++) {
    const filter = decompressed[srcPos++];
    for (let x = 0; x < rowSize; x++) {
      const byte = decompressed[srcPos++];
      const a = x >= bpp ? currRow[x - bpp] : 0;
      const b = prevRow[x];
      const c = x >= bpp ? prevRow[x - bpp] : 0;
      
      let val = 0;
      if (filter === 0) val = byte;
      else if (filter === 1) val = (byte + a) & 0xff;
      else if (filter === 2) val = (byte + b) & 0xff;
      else if (filter === 3) val = (byte + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) val = (byte + paethPredictor(a, b, c)) & 0xff;
      currRow[x] = val;
    }
    
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      const srcIdx = x * bpp;
      rgba[dstIdx] = currRow[srcIdx];
      rgba[dstIdx + 1] = currRow[srcIdx + 1];
      rgba[dstIdx + 2] = currRow[srcIdx + 2];
      rgba[dstIdx + 3] = bpp === 4 ? currRow[srcIdx + 3] : 255;
    }
    
    currRow.copy(prevRow);
  }
  
  return { width, height, rgba };
}

// Main execution
const inputPath = path.join(__dirname, '../public/assets/aistudio/Generated_Image_October_22__2026_-_11_37AM_f9c7a775.png');
const outDir = path.join(__dirname, '../public/assets/fish');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Loading master image from:', inputPath);
const masterBuf = fs.readFileSync(inputPath);
const { width, height, rgba } = parsePNG(masterBuf);
console.log(`Master loaded: ${width}x${height}`);

// Fish search regions:
// All fish face RIGHT except top_center Showa which faces LEFT (flipH = true)
const fishConfigs = [
  { id: 0, name: 'kohaku', region: [15, 60, 420, 245], flipH: false, label: 'Cá Koi Kohaku (Trắng Cam)' },
  { id: 1, name: 'showa', region: [430, 40, 785, 230], flipH: true, label: 'Cá Koi Showa (Đen Đỏ Trắng)' },
  { id: 2, name: 'goldfish', region: [790, 70, 1190, 260], flipH: false, label: 'Cá Vàng Ba Đuôi (Fantail)' },
  { id: 3, name: 'comet', region: [10, 360, 420, 540], flipH: false, label: 'Cá Chép Đỏ (Red Comet)' },
  { id: 4, name: 'cichlid', region: [700, 320, 1190, 530], flipH: false, label: 'Cá La Hán Lam Hồng (Cichlid)' },
  { id: 5, name: 'flowerhorn', region: [20, 610, 550, 830], flipH: false, label: 'Cá La Hán Đại (Flowerhorn)' },
  { id: 6, name: 'arowana', region: [600, 590, 1190, 820], flipH: false, label: 'Cá Rồng Vây Dài (Black Arowana)' },
];

const fishMetadata = [];

fishConfigs.forEach((cfg, idx) => {
  const [rx1, ry1, rx2, ry2] = cfg.region;
  
  // Find precise bounding box of non-white pixels
  let minX = rx2, minY = ry2, maxX = rx1, maxY = ry1;
  for (let y = ry1; y <= ry2; y++) {
    for (let x = rx1; x <= rx2; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      // Check if not background white
      if (r < 240 || g < 240 || b < 240) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  // Add padding around fish
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  
  // First, extract the cropped buffer
  const tempBuf = Buffer.alloc(cropW * cropH * 4);
  for (let cy = 0; cy < cropH; cy++) {
    for (let cx = 0; cx < cropW; cx++) {
      const srcX = minX + cx;
      const srcY = minY + cy;
      const srcI = (srcY * width + srcX) * 4;
      const dstI = (cy * cropW + cx) * 4;
      tempBuf[dstI] = rgba[srcI];
      tempBuf[dstI + 1] = rgba[srcI + 1];
      tempBuf[dstI + 2] = rgba[srcI + 2];
      tempBuf[dstI + 3] = rgba[srcI + 3];
    }
  }
  
  // Use BFS flood fill from the borders to detect all exterior background pixels!
  // This prevents punching holes inside fish bodies (like Kohaku head or Showa white spots)
  const isBg = new Uint8Array(cropW * cropH);
  const queue = [];
  
  function isLight(cx, cy) {
    const idx = (cy * cropW + cx) * 4;
    const r = tempBuf[idx];
    const g = tempBuf[idx + 1];
    const b = tempBuf[idx + 2];
    return Math.min(r, g, b) >= 236;
  }
  
  // Seed border pixels
  for (let x = 0; x < cropW; x++) {
    if (isLight(x, 0)) { isBg[0 * cropW + x] = 1; queue.push(x, 0); }
    if (isLight(x, cropH - 1)) { isBg[(cropH - 1) * cropW + x] = 1; queue.push(x, cropH - 1); }
  }
  for (let y = 0; y < cropH; y++) {
    if (isLight(0, y)) { isBg[y * cropW + 0] = 1; queue.push(0, y); }
    if (isLight(cropW - 1, y)) { isBg[y * cropW + (cropW - 1)] = 1; queue.push(cropW - 1, y); }
  }
  
  // BFS
  let qHead = 0;
  while (qHead < queue.length) {
    const qx = queue[qHead++];
    const qy = queue[qHead++];
    const neighbors = [
      [qx + 1, qy],
      [qx - 1, qy],
      [qx, qy + 1],
      [qx, qy - 1]
    ];
    for (let k = 0; k < 4; k++) {
      const nx = neighbors[k][0];
      const ny = neighbors[k][1];
      if (nx >= 0 && nx < cropW && ny >= 0 && ny < cropH) {
        const nidx = ny * cropW + nx;
        if (isBg[nidx] === 0 && isLight(nx, ny)) {
          isBg[nidx] = 1;
          queue.push(nx, ny);
        }
      }
    }
  }
  
  // Now create final cropped buffer with alpha transparency and edge feathering
  const finalCropped = Buffer.alloc(cropW * cropH * 4);
  
  for (let cy = 0; cy < cropH; cy++) {
    for (let cx = 0; cx < cropW; cx++) {
      // Apply flipH if required (so head always points right)
      const readX = cfg.flipH ? (cropW - 1 - cx) : cx;
      const readY = cy;
      const srcIdx = (readY * cropW + readX) * 4;
      const dstIdx = (cy * cropW + cx) * 4;
      
      let r = tempBuf[srcIdx];
      let g = tempBuf[srcIdx + 1];
      let b = tempBuf[srcIdx + 2];
      const minVal = Math.min(r, g, b);
      
      let alpha = 255;
      if (isBg[readY * cropW + readX] === 1) {
        // Pure exterior background
        alpha = 0;
      } else {
        // Check if this is an edge pixel touching the background
        let touchesBg = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const tx = readX + dx;
            const ty = readY + dy;
            if (tx >= 0 && tx < cropW && ty >= 0 && ty < cropH) {
              if (isBg[ty * cropW + tx] === 1) {
                touchesBg = true;
                break;
              }
            }
          }
          if (touchesBg) break;
        }
        
        if (touchesBg && minVal > 200) {
          // Feather smooth edge
          const t = Math.min(1, Math.max(0, (minVal - 200) / (240 - 200)));
          alpha = Math.round(255 * (1 - t * 0.85));
          // De-fringe: remove white wash from semi-transparent edge
          r = Math.min(255, Math.max(0, Math.round((r - t * 255) / (1 - t * 0.8))));
          g = Math.min(255, Math.max(0, Math.round((g - t * 255) / (1 - t * 0.8))));
          b = Math.min(255, Math.max(0, Math.round((b - t * 255) / (1 - t * 0.8))));
        }
      }
      
      finalCropped[dstIdx] = r;
      finalCropped[dstIdx + 1] = g;
      finalCropped[dstIdx + 2] = b;
      finalCropped[dstIdx + 3] = alpha;
    }
  }
  
  const pngData = encodePNG(cropW, cropH, finalCropped);
  const outPath = path.join(outDir, `fish_${idx}.png`);
  fs.writeFileSync(outPath, pngData);
  
  console.log(`Saved fish_${idx}.png (${cfg.name}): ${cropW}x${cropH}, bytes=${pngData.length}, flipped=${cfg.flipH}`);
  
  fishMetadata.push({
    id: idx,
    name: cfg.name,
    label: cfg.label,
    url: `/assets/fish/fish_${idx}.png`,
    width: cropW,
    height: cropH,
    aspectRatio: cropW / cropH,
  });
});

fs.writeFileSync(
  path.join(outDir, 'metadata.json'),
  JSON.stringify(fishMetadata, null, 2)
);
console.log('Done! All 7 fish sliced, background removed with BFS flood-fill, and saved to public/assets/fish/');
