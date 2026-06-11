import {
  makeBmpBlackTransparent,
  parseBmp32,
} from "./formats.js?v=20260611-11";

export async function decodeImageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return makeBmpBlackTransparent(parseBmp32(bytes));
  }

  const bitmap = await createImageBitmap(
    new Blob([bytes], { type: file.type || "image/png" })
  );
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return {
    width: imageData.width,
    height: imageData.height,
    pixels: imageData.data,
  };
}

export function renderTextAsset(text, { size, weight, color }) {
  const measureCanvas = document.createElement("canvas");
  const measure = measureCanvas.getContext("2d");
  const font = `${weight} ${size}px "Noto Sans JP", "Yu Gothic", "Hiragino Sans", sans-serif`;
  measure.font = font;
  const width = Math.max(1, Math.ceil(measure.measureText(text).width));
  const height = Math.max(1, Math.ceil(size * 1.35));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.font = font;
  context.textBaseline = "alphabetic";
  context.fillStyle = color;
  context.fillText(text, 0, height - 2);
  return {
    width,
    height,
    pixels: context.getImageData(0, 0, width, height).data,
  };
}

export function drawPixels(canvas, image) {
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(
    new Uint8ClampedArray(image.pixels),
    image.width,
    image.height
  ), 0, 0);
}

export function download(filename, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
