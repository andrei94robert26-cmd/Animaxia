#!/usr/bin/env node
/**
 * Animaxia PWA Icon Generator
 * Generates valid PNG icons (192x192 and 512x512) using pure Node.js
 * with a gradient purple background and star symbol.
 * 
 * Uses minimal PNG encoder - no external dependencies.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ===== SIMPLE PNG ENCODER =====
class PNGEncoder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    // Each row: filter byte (1) + RGBA pixels (width * 4)
    this.rowSize = 1 + width * 4;
    this.rawData = Buffer.alloc(this.rowSize * height);
    this._fillTransparent();
  }

  _fillTransparent() {
    for (let y = 0; y < this.height; y++) {
      const rowOffset = y * this.rowSize;
      this.rawData[rowOffset] = 0; // filter: None
      for (let x = 0; x < this.width; x++) {
        const px = rowOffset + 1 + x * 4;
        this.rawData[px] = 0;     // R
        this.rawData[px + 1] = 0; // G
        this.rawData[px + 2] = 0; // B
        this.rawData[px + 3] = 0; // A
      }
    }
  }

  setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const offset = y * this.rowSize + 1 + x * 4;
    this.rawData[offset] = r;
    this.rawData[offset + 1] = g;
    this.rawData[offset + 2] = b;
    this.rawData[offset + 3] = a;
  }

  _writeU32(buf, offset, val) {
    buf.writeUInt32BE(val, offset);
  }

  _writeChunk(buf, type, data) {
    let offset = 8; // past signature
    // We'll build manually
    const len = data.length;
    const chunk = Buffer.alloc(12 + len);
    this._writeU32(chunk, 0, len);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    // CRC32
    const crc = this._crc32(Buffer.concat([
      Buffer.from(type, 'ascii'),
      data
    ]));
    this._writeU32(chunk, 8 + len, crc);
    return chunk;
  }

  _crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ 0xEDB88320;
        } else {
          crc = crc >>> 1;
        }
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  toBuffer() {
    // Compress raw data with zlib
    const deflated = zlib.deflateSync(this.rawData);
    
    // PNG Signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    
    // IHDR chunk
    const ihdr = Buffer.alloc(13);
    this._writeU32(ihdr, 0, this.width);
    this._writeU32(ihdr, 4, this.height);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type: RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace
    
    // Build chunks
    const chunks = [
      this._writeChunk(null, 'IHDR', ihdr),
      this._writeChunk(null, 'IDAT', deflated),
      this._writeChunk(null, 'IEND', Buffer.alloc(0))
    ];
    
    // We need to write CRC correctly for each chunk
    // Let me rebuild properly
    const allChunks = [signature];
    
    for (const chunkData of [
      { type: 'IHDR', data: ihdr },
      { type: 'IDAT', data: deflated },
      { type: 'IEND', data: Buffer.alloc(0) }
    ]) {
      const len = chunkData.data.length;
      const typeBuf = Buffer.from(chunkData.type, 'ascii');
      
      // CRC covers type + data
      const crcInput = Buffer.concat([typeBuf, chunkData.data]);
      const crc = this._crc32(crcInput);
      
      const chunk = Buffer.alloc(12 + len);
      this._writeU32(chunk, 0, len);
      typeBuf.copy(chunk, 4);
      chunkData.data.copy(chunk, 8);
      this._writeU32(chunk, 8 + len, crc);
      
      allChunks.push(chunk);
    }
    
    return Buffer.concat(allChunks);
  }
}

// ===== GENERATE ICONS =====
function distance(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function generateIcon(size) {
  const png = new PNGEncoder(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.43;
  const starRadius = size * 0.2;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = distance(x, y, cx, cy);
      
      // Gradient purple background circle
      if (dist <= radius) {
        // Gradient from center: #6c5ce7 (center) to #a29bfe (edge)
        const t = dist / radius;
        const r = Math.round(108 + (162 - 108) * t);
        const g = Math.round(92 + (155 - 92) * t);
        const b = Math.round(231 + (254 - 231) * t);
        
        // Anti-aliasing on edge
        const edge = radius - dist;
        if (edge > 0 && edge < 2) {
          const alpha = Math.max(0, Math.min(255, Math.round((edge / 2) * 255)));
          png.setPixel(x, y, r, g, b, alpha);
        } else {
          png.setPixel(x, y, r, g, b, 255);
        }
      }
      
      // Draw star symbol: ✦
      // Simple 4-point star
      const starInner = starRadius * 0.4;
      
      // Vertical arm
      if (Math.abs(x - cx) < size * 0.04 && Math.abs(y - cy) < starRadius) {
        png.setPixel(x, y, 255, 255, 255, 255);
      }
      // Horizontal arm
      if (Math.abs(y - cy) < size * 0.04 && Math.abs(x - cx) < starRadius) {
        png.setPixel(x, y, 255, 255, 255, 255);
      }
      // Diagonal arms
      const dx = x - cx;
      const dy = y - cy;
      if (Math.abs(Math.abs(dx) - Math.abs(dy)) < size * 0.04 && 
          Math.sqrt(dx*dx + dy*dy) < starRadius &&
          Math.sqrt(dx*dx + dy*dy) > starInner) {
        png.setPixel(x, y, 255, 255, 255, 255);
      }
      
      // Center dot
      if (distance(x, y, cx, cy) < size * 0.06) {
        png.setPixel(x, y, 255, 255, 255, 255);
      }
    }
  }
  
  return png.toBuffer();
}

// ===== MAIN =====
const outputDir = path.join(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🔥 Generating Animaxia PWA icons...');

const sizes = [192, 512];
for (const size of sizes) {
  const pngData = generateIcon(size);
  const outputPath = path.join(outputDir, `icon-${size}.png`);
  fs.writeFileSync(outputPath, pngData);
  const fileSize = fs.statSync(outputPath).size;
  console.log(`✅ icon-${size}.png generated: ${fileSize} bytes (${size}x${size})`);
}

// Also generate apple-touch-icon
const appleIcon = generateIcon(180);
fs.writeFileSync(path.join(outputDir, '..', 'apple-touch-icon.png'), appleIcon);
console.log('✅ apple-touch-icon.png generated: 180x180');

// Generate favicon (32x32)
const favicon = generateIcon(32);
fs.writeFileSync(path.join(outputDir, '..', 'favicon.ico'), favicon);
console.log('✅ favicon.ico generated: 32x32');

console.log('✅ All icons generated successfully!');
