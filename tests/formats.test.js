import assert from "node:assert/strict";
import test from "node:test";

import {
  detectOutputTarget,
  encodeBmp32,
  findConflictingImageFiles,
  findDatFolderFileSets,
  findDatFolderFiles,
  packAssets,
  parseBmp32,
  parseImageData,
  serializeImageData,
} from "../src/formats.js";
import {
  decodeShiftJis,
  parseCustomText,
  parseVoiceText,
} from "../src/text-assets.js";
import {
  createWorkspaceRecord,
  restoreWorkspaceRecord,
} from "../src/workspace-store.js";
import { History } from "../src/history.js";

test("DAT filenames select the matching output target", () => {
  assert.equal(detectOutputTarget("image.dat", "imagedata.dat"), "1");
  assert.equal(detectOutputTarget("IMAGE2.DAT", "IMAGEDATA2.DAT"), "2");
});

test("both DAT file sets are detected and can be selected", () => {
  const files = [
    { name: "image2.dat" },
    { name: "imagedata2.dat" },
    { name: "image.dat" },
    { name: "imagedata.dat" },
    { name: "custom.txt" },
    { name: "voice.txt" },
  ];
  const sets = findDatFolderFileSets(files);
  assert.deepEqual(sets.map(set => set.target), ["1", "2"]);
  assert.equal(findDatFolderFiles(files, "1").imageFile.name, "image.dat");
  assert.equal(findDatFolderFiles(files, "2").imageFile.name, "image2.dat");
  assert.equal(sets[0].customFile.name, "custom.txt");
  assert.equal(sets[1].voiceFile.name, "voice.txt");
});

test("a single DAT file set is selected automatically", () => {
  const detected = findDatFolderFiles([
    { name: "image2.dat" },
    { name: "imagedata2.dat" },
  ]);
  assert.equal(detected.target, "2");
});

test("same-name image files are detected before overwrite", () => {
  const conflicts = findConflictingImageFiles(
    [{ name: "alpha.png" }, { name: "beta.bmp" }],
    ["alpha", "gamma"]
  );
  assert.deepEqual(conflicts.map(file => file.name), ["alpha.png"]);
});

test("workspace state round-trips through its stored record", () => {
  const state = {
    assets: new Map([["sample", {
      name: "sample",
      width: 1,
      height: 1,
      pixels: new Uint8ClampedArray([1, 2, 3, 4]),
      sourceType: "PNG",
    }]]),
    selectedName: "sample",
    view: "asset",
    zoom: 3,
  };
  const record = createWorkspaceRecord(state, {
    atlasWidth: "2048",
    opaqueOutput: true,
    outputTarget: "2",
  });
  const restored = restoreWorkspaceRecord(record);
  assert.equal(restored.assets.get("sample").pixels[2], 3);
  assert.equal(restored.selectedName, "sample");
  assert.equal(restored.view, "asset");
  assert.equal(restored.settings.outputTarget, "2");
});

test("history supports undo, redo, and clears redo after a new edit", () => {
  const history = new History(2);
  history.record("first");
  history.record("second");
  history.record("third");

  assert.equal(history.undo("current"), "third");
  assert.equal(history.redo("after undo"), "current");
  assert.equal(history.undo("current again"), "after undo");

  history.record("new edit");
  assert.equal(history.canRedo, false);
  assert.equal(history.undo("latest"), "new edit");
});

test("Shift_JIS custom and voice files are parsed as Japanese", () => {
  const customBytes = Uint8Array.from([0x74, 0x5f, 0x61, 0x0a, 0x3d, 0x0a, 0x93, 0xc5]);
  assert.equal(parseCustomText(decodeShiftJis(customBytes)).get("t_a"), "毒");
  assert.deepEqual(parseVoiceText("male\n助けて\nfemale\nきゃー\n"), {
    male: ["助けて"],
    female: ["きゃー"],
  });
});

test("imagedata.dat metadata round-trips", () => {
  const source = {
    width: 1024,
    height: 96,
    transparentColor: 0x112233,
    entries: [
      { name: "alpha", x: 0, y: 0, width: 16, height: 24 },
      { name: "beta", x: 16, y: 0, width: 32, height: 24 },
    ],
  };

  assert.deepEqual(parseImageData(serializeImageData(source)), source);
});

test("32-bit BMP pixels round-trip without color conversion", () => {
  const source = {
    width: 2,
    height: 2,
    pixels: new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 128,
      0, 0, 255, 64,
      255, 255, 255, 0,
    ]),
  };

  const parsed = parseBmp32(encodeBmp32(source));
  assert.equal(parsed.width, source.width);
  assert.equal(parsed.height, source.height);
  assert.deepEqual(parsed.pixels, source.pixels);
});

test("assets are packed using the Java-compatible size ordering", () => {
  const asset = (name, width, height, red) => ({
    name,
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4).fill(red),
  });
  const atlas = packAssets([
    asset("wide", 6, 3, 10),
    asset("short", 2, 2, 20),
    asset("narrow", 3, 3, 30),
  ], 8);

  assert.deepEqual(atlas.entries, [
    { name: "short", x: 0, y: 0, width: 2, height: 2 },
    { name: "narrow", x: 2, y: 0, width: 3, height: 3 },
    { name: "wide", x: 0, y: 3, width: 6, height: 3 },
  ]);
  assert.equal(atlas.height, 8);
});
