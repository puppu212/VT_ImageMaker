const HEADER_SIZE = 54;

export function detectOutputTarget(imageName, dataName) {
  const image = imageName.toLowerCase();
  const data = dataName.toLowerCase();
  return image === "image2.dat" && data === "imagedata2.dat" ? "2" : "1";
}

export function findDatFolderFiles(files) {
  const byName = new Map(
    [...files].map(file => [file.name.toLowerCase(), file])
  );
  const firstPair = {
    imageFile: byName.get("image.dat"),
    dataFile: byName.get("imagedata.dat"),
  };
  const secondPair = {
    imageFile: byName.get("image2.dat"),
    dataFile: byName.get("imagedata2.dat"),
  };
  const pair = firstPair.imageFile && firstPair.dataFile
    ? firstPair
    : secondPair.imageFile && secondPair.dataFile
      ? secondPair
      : null;
  if (!pair) {
    throw new Error("対応する2つのDATファイルが見つかりません");
  }
  return {
    ...pair,
    customFile: byName.get("custom.txt") ?? null,
    voiceFile: byName.get("voice.txt") ?? null,
  };
}

export function findConflictingImageFiles(files, existingNames) {
  const names = existingNames instanceof Set
    ? existingNames
    : new Set(existingNames);
  return [...files].filter(file => names.has(file.name.replace(/\.[^.]+$/, "")));
}

export function parseImageData(buffer) {
  const view = new DataView(asArrayBuffer(buffer));
  if (view.byteLength < 13) throw new Error("imagedata.dat が短すぎます");
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const transparentColor = view.getUint32(8, true) & 0xffffff;
  const entries = [];
  let offset = 12;

  while (offset < view.byteLength) {
    const nameBytes = [];
    while (offset < view.byteLength) {
      const byte = view.getUint8(offset++);
      if (byte === 0) break;
      nameBytes.push(byte);
    }
    const name = String.fromCharCode(...nameBytes);
    if (name === "________") break;
    if (!name || offset + 16 > view.byteLength) {
      throw new Error("imagedata.dat の項目が壊れています");
    }
    const left = view.getUint32(offset, true);
    const top = view.getUint32(offset + 4, true);
    const right = view.getUint32(offset + 8, true);
    const bottom = view.getUint32(offset + 12, true);
    offset += 16;
    entries.push({
      name,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }
  return { width, height, transparentColor, entries };
}

export function serializeImageData({ width, height, transparentColor, entries }) {
  const size = 12 + entries.reduce((total, entry) =>
    total + entry.name.length + 1 + 16, 0) + 9;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint32(0, width, true);
  view.setUint32(4, height, true);
  view.setUint32(8, transparentColor & 0xffffff, true);
  let offset = 12;

  for (const entry of entries) {
    for (const char of entry.name) {
      view.setUint8(offset++, char.charCodeAt(0) & 0xff);
    }
    view.setUint8(offset++, 0);
    view.setUint32(offset, entry.x, true);
    view.setUint32(offset + 4, entry.y, true);
    view.setUint32(offset + 8, entry.x + entry.width, true);
    view.setUint32(offset + 12, entry.y + entry.height, true);
    offset += 16;
  }
  for (let index = 0; index < 8; index++) view.setUint8(offset++, 0x5f);
  view.setUint8(offset, 0);
  return new Uint8Array(buffer);
}

export function parseBmp32(buffer) {
  const source = asArrayBuffer(buffer);
  const view = new DataView(source);
  if (view.byteLength < HEADER_SIZE || view.getUint16(0, true) !== 0x4d42) {
    throw new Error("image.dat はBMP形式ではありません");
  }
  const pixelOffset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const signedHeight = view.getInt32(22, true);
  const bits = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (width <= 0 || signedHeight === 0 || bits !== 32 || compression !== 0) {
    throw new Error("32bit無圧縮BMPのみ読み込めます");
  }

  const height = Math.abs(signedHeight);
  const topDown = signedHeight < 0;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = topDown ? y : height - y - 1;
    for (let x = 0; x < width; x++) {
      const sourceOffset = pixelOffset + (sourceY * width + x) * 4;
      const targetOffset = (y * width + x) * 4;
      pixels[targetOffset] = view.getUint8(sourceOffset + 2);
      pixels[targetOffset + 1] = view.getUint8(sourceOffset + 1);
      pixels[targetOffset + 2] = view.getUint8(sourceOffset);
      pixels[targetOffset + 3] = view.getUint8(sourceOffset + 3);
    }
  }
  return { width, height, pixels };
}

export function encodeBmp32({ width, height, pixels }) {
  const pixelSize = width * height * 4;
  const buffer = new ArrayBuffer(HEADER_SIZE + pixelSize);
  const view = new DataView(buffer);
  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4d);
  view.setUint32(2, HEADER_SIZE + pixelSize, true);
  view.setUint32(10, HEADER_SIZE, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);

  for (let y = 0; y < height; y++) {
    const targetY = height - y - 1;
    for (let x = 0; x < width; x++) {
      const sourceOffset = (y * width + x) * 4;
      const targetOffset = HEADER_SIZE + (targetY * width + x) * 4;
      view.setUint8(targetOffset, pixels[sourceOffset + 2]);
      view.setUint8(targetOffset + 1, pixels[sourceOffset + 1]);
      view.setUint8(targetOffset + 2, pixels[sourceOffset]);
      view.setUint8(targetOffset + 3, pixels[sourceOffset + 3]);
    }
  }
  return new Uint8Array(buffer);
}

export function extractAssets(atlas, metadata) {
  return metadata.entries.map(entry => {
    const pixels = new Uint8ClampedArray(entry.width * entry.height * 4);
    for (let y = 0; y < entry.height; y++) {
      const sourceStart = ((entry.y + y) * atlas.width + entry.x) * 4;
      const targetStart = y * entry.width * 4;
      pixels.set(
        atlas.pixels.subarray(sourceStart, sourceStart + entry.width * 4),
        targetStart
      );
    }
    makeTransparentColor(pixels, metadata.transparentColor);
    return { name: entry.name, width: entry.width, height: entry.height, pixels };
  });
}

export function packAssets(assets, width, opaque = false) {
  const ordered = [...assets].sort((a, b) =>
    a.height - b.height || a.width - b.width || a.name.localeCompare(b.name)
  );
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const entries = [];

  for (const asset of ordered) {
    if (asset.width > width) {
      throw new Error(`${asset.name} の横幅が出力幅を超えています`);
    }
    if (x + asset.width > width) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    entries.push({ name: asset.name, x, y, width: asset.width, height: asset.height });
    x += asset.width;
    rowHeight = Math.max(rowHeight, asset.height);
  }

  const height = Math.max(8, y + rowHeight);
  const transparentColor = findTransparentColor(assets);
  const pixels = new Uint8ClampedArray(width * height * 4);
  if (opaque) fillColor(pixels, transparentColor, 255);

  for (let index = 0; index < ordered.length; index++) {
    const asset = ordered[index];
    const entry = entries[index];
    for (let assetY = 0; assetY < asset.height; assetY++) {
      for (let assetX = 0; assetX < asset.width; assetX++) {
        const source = (assetY * asset.width + assetX) * 4;
        const target = ((entry.y + assetY) * width + entry.x + assetX) * 4;
        const alpha = asset.pixels[source + 3];
        if (alpha === 0 && opaque) {
          writeColor(pixels, target, transparentColor, 255);
        } else {
          pixels.set(asset.pixels.subarray(source, source + 4), target);
          if (opaque && alpha > 0) pixels[target + 3] = 255;
        }
      }
    }
  }
  return { width, height, pixels, entries, transparentColor };
}

export function makeBmpBlackTransparent(image) {
  const pixels = new Uint8ClampedArray(image.pixels);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset] === 0 && pixels[offset + 1] === 0 && pixels[offset + 2] === 0) {
      pixels[offset + 3] = 0;
    }
  }
  return { ...image, pixels };
}

function findTransparentColor(assets) {
  const used = new Set();
  for (const asset of assets) {
    for (let offset = 0; offset < asset.pixels.length; offset += 4) {
      used.add(
        (asset.pixels[offset] << 16) |
        (asset.pixels[offset + 1] << 8) |
        asset.pixels[offset + 2]
      );
    }
  }
  let color = 0;
  while (used.has(color) && color < 0xffffff) color++;
  return color;
}

function makeTransparentColor(pixels, transparentColor) {
  const red = (transparentColor >>> 16) & 0xff;
  const green = (transparentColor >>> 8) & 0xff;
  const blue = transparentColor & 0xff;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset] === red && pixels[offset + 1] === green && pixels[offset + 2] === blue) {
      pixels[offset + 3] = 0;
    }
  }
}

function fillColor(pixels, color, alpha) {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    writeColor(pixels, offset, color, alpha);
  }
}

function writeColor(pixels, offset, color, alpha) {
  pixels[offset] = (color >>> 16) & 0xff;
  pixels[offset + 1] = (color >>> 8) & 0xff;
  pixels[offset + 2] = color & 0xff;
  pixels[offset + 3] = alpha;
}

function asArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}
