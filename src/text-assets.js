const LABEL_STYLES = {
  t_levelup: [12, 700, "#ffff00"],
  t_retreat: [12, 700, "#00ff00"],
  t_chgskill: [12, 700, "#ffffff"],
  t_defskill: [12, 700, "#ffffff"],
  t_stopskill: [12, 700, "#ffc8ff"],
  t_spmiss: [12, 700, "#00ff00"],
  t_sphas: [12, 700, "#ffffff"],
  t_disskill: [12, 700, "#ffc8ff"],
  t_cept: [12, 400, "#c8c8c8"],
  t_pfront: [12, 700, "#c8ffff"],
  t_pback: [12, 700, "#c8c8ff"],
  t_pmove: [12, 700, "#c8ffc8"],
  t_pfix: [12, 700, "#ffffc8"],
};

const STATUS_COLORS = {
  t_poison: "#ffa0a0",
  t_paralysis: "#00ffff",
  t_silence: "#ffffff",
  t_confusion: "#a0ffa0",
  t_illusion: "#ffc800",
  t_stone: "#ffffff",
  t_fear: "#a0a0ff",
  t_suck: "#ff80ff",
  t_magsuck: "#ff80ff",
  t_drain: "#ffc800",
  t_death: "#fff0f0",
};

export function decodeShiftJis(buffer) {
  return new TextDecoder("shift_jis").decode(buffer).replace(/\0+$/g, "");
}

export function parseCustomText(text) {
  const result = new Map();
  const lines = normalizeLines(text);
  let index = 0;
  while (index < lines.length) {
    const key = lines[index++].trim();
    if (!key) continue;
    while (index < lines.length && !lines[index].trim()) index++;
    if (lines[index]?.trim() !== "=") continue;
    index++;
    while (index < lines.length && !lines[index].trim()) index++;
    if (index < lines.length) result.set(key, lines[index++].trim());
  }
  return result;
}

export function parseVoiceText(text) {
  const result = { male: [], female: [] };
  let section = null;
  for (const rawLine of normalizeLines(text)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("*")) continue;
    if (line === "male" || line === "female") {
      section = line;
      continue;
    }
    if (section && result[section].length < 10) result[section].push(line);
  }
  return result;
}

export function getTextAssetStyle(name) {
  const key = name.toLowerCase();
  if (LABEL_STYLES[key]) {
    const [size, weight, color] = LABEL_STYLES[key];
    return { size, weight, color };
  }
  if (STATUS_COLORS[key]) {
    return { size: 16, weight: 700, color: STATUS_COLORS[key] };
  }
  if (key.endsWith("down")) return { size: 14, weight: 700, color: "#00ffff" };
  if (key.endsWith("up")) return { size: 16, weight: 700, color: "#ffff00" };
  return { size: 16, weight: 700, color: "#ffffff" };
}

function normalizeLines(text) {
  return text.replace(/\r\n?/g, "\n").split("\n");
}
