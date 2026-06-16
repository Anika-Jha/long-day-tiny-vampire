import type { Level } from "./types";

const GROUND_Y = 500;
const WORLD_H = 560;

function ground(x: number, w: number, y = GROUND_Y, style: "ground" = "ground") {
  return { x, y, w, h: WORLD_H - y + 40, style };
}

/* ----------------------------- LEVEL 1: SUSHI ----------------------------- */
const level1: Level = {
  id: 1,
  theme: {
    name: "International Sushi Day",
    subtitle: "Mind the conveyor belts",
    skyTop: "#9fd6ff",
    skyBottom: "#ffe3c2",
    ground: "#caa37a",
    accent: "#ff7a85",
    drain: 1,
    music: "sushi",
    sunStage: 1,
  },
  worldW: 3000,
  worldH: WORLD_H,
  spawn: { x: 60, y: 440 },
  goal: { x: 2880, y: 420, w: 70, h: 80 },
  platforms: [
    ground(0, 520),
    // conveyor belts
    { x: 560, y: 470, w: 360, h: 26, conveyor: 70, style: "wood" },
    { x: 1000, y: 430, w: 300, h: 26, conveyor: -60, style: "wood" },
    { x: 1380, y: 470, w: 360, h: 26, conveyor: 90, style: "wood" },
    ground(1820, 360),
    { x: 2260, y: 440, w: 220, h: 26, conveyor: 60, style: "wood" },
    ground(2560, 440),
    // little ledges
    { x: 320, y: 400, w: 120, h: 20, style: "wood" },
    { x: 2120, y: 360, w: 110, h: 18, style: "wood" },
  ],
  shade: [
    { x: 0, y: 0, w: 200, h: 560, style: "building" },
    { x: 1820, y: 300, w: 120, h: 260, style: "tent" },
    { x: 2560, y: 0, w: 440, h: 560, style: "building" },
  ],
  movingShade: [
    // serving trays gliding overhead casting shade columns
    { x: 560, y: 180, w: 130, h: 22, style: "tray", castsShade: true, move: { axis: "x", min: 540, max: 900, speed: 70 } },
    { x: 1020, y: 150, w: 130, h: 22, style: "tray", castsShade: true, move: { axis: "x", min: 1000, max: 1300, speed: -90, phase: 0.5 } },
    { x: 1400, y: 180, w: 140, h: 22, style: "tray", castsShade: true, move: { axis: "x", min: 1380, max: 1740, speed: 80 } },
    { x: 2260, y: 160, w: 130, h: 22, style: "tray", castsShade: true, move: { axis: "x", min: 2240, max: 2480, speed: 75 } },
  ],
  collectibles: [
    { x: 360, y: 360, w: 22, h: 22, kind: "moon", id: "l1m1" },
    { x: 1120, y: 380, w: 22, h: 22, kind: "moon", id: "l1m2" },
    { x: 1560, y: 420, w: 22, h: 22, kind: "token", id: "l1t1" },
    { x: 2150, y: 320, w: 22, h: 22, kind: "moon", id: "l1m3", secret: true, label: "Rooftop Moon" },
    { x: 2660, y: 360, w: 26, h: 26, kind: "sticker", id: "l1s1", label: "Lost Coffin: Sushi District", secret: true },
  ],
  bouncePads: [],
  checkpoints: [{ x: 1800, y: 440, w: 30, h: 60, id: "l1c1" }],
  dialogue: [
    { id: "l1d0", x: 40, lines: ["NOX: Rise and shine, boss. Well... shine is the problem.", "NOX: Stay in the shade. Sunlight drains your energy.", "NOX: Use the moving tray shadows to cross. Time it!"] },
    { id: "l1d1", x: 980, lines: ["NOX: Humans really celebrate everything. A whole day for sushi?", "NOX: Hop the belts when a tray shadow passes over."] },
    { id: "l1d2", x: 2200, lines: ["NOX: That giant fish over there is judging me."] },
  ],
  puzzle: "none",
  hint: "Ride the belts. Cross when a tray's shadow covers you.",
};

/* --------------------------- LEVEL 2: FLIP-FLOP --------------------------- */
const level2: Level = {
  id: 2,
  theme: {
    name: "National Flip-Flop Day",
    subtitle: "Catapult across the bay",
    skyTop: "#7ec8ff",
    skyBottom: "#ffd79a",
    ground: "#e9d29a",
    accent: "#ff9a3d",
    drain: 1.1,
    music: "beach",
    sunStage: 2,
  },
  worldW: 3100,
  worldH: WORLD_H,
  spawn: { x: 60, y: 440 },
  goal: { x: 2960, y: 410, w: 70, h: 90 },
  platforms: [
    ground(0, 360),
    ground(620, 220),
    ground(1180, 200),
    ground(1640, 200),
    ground(2120, 220),
    ground(2620, 480),
    { x: 980, y: 360, w: 90, h: 18, style: "wood" },
    { x: 1480, y: 330, w: 90, h: 18, style: "wood" },
  ],
  shade: [
    { x: 60, y: 280, w: 150, h: 280, style: "umbrella" },
    { x: 660, y: 250, w: 150, h: 310, style: "umbrella" },
    { x: 1200, y: 250, w: 150, h: 310, style: "umbrella" },
    { x: 1680, y: 250, w: 140, h: 310, style: "umbrella" },
    { x: 2160, y: 250, w: 150, h: 310, style: "umbrella" },
    { x: 2700, y: 230, w: 200, h: 330, style: "umbrella" },
  ],
  movingShade: [
    { x: 1000, y: 120, w: 200, h: 30, style: "tray", castsShade: true, move: { axis: "x", min: 900, max: 1500, speed: 60 } },
  ],
  collectibles: [
    { x: 700, y: 360, w: 22, h: 22, kind: "moon", id: "l2m1" },
    { x: 1010, y: 300, w: 22, h: 22, kind: "token", id: "l2t1" },
    { x: 1250, y: 360, w: 22, h: 22, kind: "moon", id: "l2m2" },
    { x: 1510, y: 270, w: 22, h: 22, kind: "moon", id: "l2m3", secret: true, label: "High Tide Moon" },
    { x: 2200, y: 360, w: 22, h: 22, kind: "token", id: "l2t2" },
    { x: 2760, y: 360, w: 26, h: 26, kind: "sticker", id: "l2s1", label: "Lost Coffin: Sunny Boardwalk", secret: true },
  ],
  bouncePads: [
    { x: 380, y: 470, w: 90, h: 30, power: 720, style: "flipflop" },
    { x: 880, y: 470, w: 90, h: 30, power: 740, style: "flipflop" },
    { x: 1400, y: 470, w: 90, h: 30, power: 760, style: "flipflop" },
    { x: 1880, y: 470, w: 90, h: 30, power: 780, style: "flipflop" },
    { x: 2380, y: 470, w: 90, h: 30, power: 760, style: "flipflop" },
  ],
  checkpoints: [{ x: 1640, y: 440, w: 30, h: 60, id: "l2c1" }],
  dialogue: [
    { id: "l2d0", x: 40, lines: ["NOX: The beach. Open sky. My nemesis.", "NOX: These giant flip-flops are catapults. Step on, get launched.", "NOX: Aim for the next umbrella's shade!"] },
    { id: "l2d1", x: 1180, lines: ["NOX: Have you considered NOT standing in sunlight?", "NOX: ...I'm helping. I'm a helper."] },
  ],
  puzzle: "none",
  hint: "Bounce off flip-flops, land in umbrella shade.",
};

/* ---------------------------- LEVEL 3: PRIDE ----------------------------- */
const level3: Level = {
  id: 3,
  theme: {
    name: "Pride Parade",
    subtitle: "Play the rainbow bridge",
    skyTop: "#8ab6ff",
    skyBottom: "#ffc9e9",
    ground: "#b98ad6",
    accent: "#ff4fa3",
    drain: 1.15,
    music: "pride",
    sunStage: 3,
  },
  worldW: 2600,
  worldH: WORLD_H,
  spawn: { x: 60, y: 440 },
  goal: { x: 2460, y: 420, w: 70, h: 80 },
  platforms: [
    ground(0, 760),
    ground(1840, 760),
  ],
  shade: [
    { x: 0, y: 0, w: 220, h: 560, style: "awning" },
    { x: 560, y: 240, w: 160, h: 320, style: "tree" },
    { x: 1140, y: 240, w: 160, h: 320, style: "tree" },
    { x: 2000, y: 0, w: 600, h: 560, style: "building" },
  ],
  movingShade: [
    { x: 900, y: 120, w: 180, h: 26, style: "cloud", castsShade: true, move: { axis: "x", min: 760, max: 1700, speed: 55 } },
  ],
  collectibles: [
    { x: 600, y: 380, w: 22, h: 22, kind: "moon", id: "l3m1" },
    { x: 1180, y: 380, w: 22, h: 22, kind: "token", id: "l3t1" },
    { x: 1300, y: 300, w: 22, h: 22, kind: "moon", id: "l3m2", secret: true, label: "Confetti Moon" },
    { x: 2120, y: 380, w: 26, h: 26, kind: "sticker", id: "l3s1", label: "Lost Coffin: Parade Route", secret: true },
  ],
  bouncePads: [],
  checkpoints: [{ x: 520, y: 440, w: 30, h: 60, id: "l3c1" }],
  // Gap from x=760 to x=1840. Stepping pads in order spawns bridge segments.
  seqPads: [
    { x: 300, y: 478, w: 60, h: 22, order: 0, color: "#ff5d5d", note: 0 },
    { x: 420, y: 478, w: 60, h: 22, order: 1, color: "#ffb13d", note: 2 },
    { x: 600, y: 478, w: 60, h: 22, order: 2, color: "#ffe14d", note: 4 },
    { x: 980, y: 478, w: 60, h: 22, order: 3, color: "#54d96a", note: 5 },
    { x: 1180, y: 478, w: 60, h: 22, order: 4, color: "#4fa3ff", note: 7 },
    { x: 1360, y: 478, w: 60, h: 22, order: 5, color: "#9b6bff", note: 9 },
  ],
  dialogue: [
    { id: "l3d0", x: 40, lines: ["NOX: Now THIS is a party. Look at all the color!", "NOX: The bridge appears when you play the notes in order.", "NOX: Step the glowing pads low to high. Follow the rainbow."] },
    { id: "l3d1", x: 700, lines: ["NOX: Red, orange, yellow, green, blue, violet. You got this.", "NOX: Each correct pad builds another plank over the gap."] },
  ],
  puzzle: "sequence",
  hint: "Step the colored pads in rainbow order to build the bridge.",
};

/* ------------------------- LEVEL 4: TURING GARDEN ------------------------ */
const level4: Level = {
  id: 4,
  theme: {
    name: "Alan Turing's Garden",
    subtitle: "Crack the cipher gate",
    skyTop: "#6f8fae",
    skyBottom: "#d8c39a",
    ground: "#8a8f76",
    accent: "#7fd1c4",
    drain: 1.2,
    music: "turing",
    sunStage: 4,
  },
  worldW: 2400,
  worldH: WORLD_H,
  spawn: { x: 60, y: 440 },
  goal: { x: 2260, y: 420, w: 70, h: 80 },
  platforms: [
    ground(0, 2400),
    { x: 360, y: 400, w: 100, h: 18, style: "stone" },
    { x: 620, y: 360, w: 100, h: 18, style: "stone" },
    { x: 880, y: 400, w: 100, h: 18, style: "stone" },
    { x: 1500, y: 410, w: 120, h: 18, style: "stone" },
  ],
  shade: [
    { x: 0, y: 0, w: 240, h: 560, style: "tree" },
    { x: 1180, y: 0, w: 220, h: 560, style: "building" },
    { x: 1980, y: 0, w: 420, h: 560, style: "tree" },
  ],
  movingShade: [
    { x: 1480, y: 120, w: 200, h: 26, style: "tray", castsShade: true, move: { axis: "x", min: 1420, max: 1900, speed: 50 } },
  ],
  collectibles: [
    { x: 640, y: 320, w: 22, h: 22, kind: "moon", id: "l4m1" },
    { x: 900, y: 360, w: 22, h: 22, kind: "token", id: "l4t1" },
    { x: 1540, y: 360, w: 22, h: 22, kind: "moon", id: "l4m2" },
    { x: 1740, y: 300, w: 22, h: 22, kind: "moon", id: "l4m3", secret: true, label: "Enigma Moon" },
    { x: 2040, y: 380, w: 26, h: 26, kind: "sticker", id: "l4s1", label: "Lost Coffin: The Garden", secret: true },
  ],
  bouncePads: [],
  checkpoints: [{ x: 1080, y: 440, w: 30, h: 60, id: "l4c1" }],
  // Three cipher levers; flip to match the target pattern to open the gate.
  levers: [
    { x: 1240, y: 440, w: 40, h: 60, id: 0, symbol: "△" },
    { x: 1340, y: 440, w: 40, h: 60, id: 1, symbol: "◇" },
    { x: 1440, y: 440, w: 40, h: 60, id: 2, symbol: "◯" },
  ],
  leverSolution: [true, false, true],
  gate: { x: 1620, y: 200, w: 30, h: 300, open: false },
  dialogue: [
    { id: "l4d0", x: 40, lines: ["NOX: A codebreaker's garden. Spooky and elegant.", "NOX: Flip the cipher levers to match the carved pattern.", "NOX: Triangle ON, diamond OFF, circle ON. The gate listens."] },
    { id: "l4d1", x: 1180, lines: ["NOX: The wall shows the answer if you look closely.", "NOX: Match it exactly and the gate slides away."] },
  ],
  puzzle: "levers",
  hint: "Set the levers to: △ on, ◇ off, ◯ on.",
};

/* ----------------------- LEVEL 5: LONGEST AFTERNOON --------------------- */
const level5: Level = {
  id: 5,
  theme: {
    name: "The Longest Afternoon",
    subtitle: "The sun is merciless",
    skyTop: "#ffd27a",
    skyBottom: "#ff9b5c",
    ground: "#c98a4f",
    accent: "#ff5a3c",
    drain: 1.9,
    music: "afternoon",
    sunStage: 5,
  },
  worldW: 2900,
  worldH: WORLD_H,
  spawn: { x: 50, y: 440 },
  goal: { x: 2780, y: 410, w: 70, h: 90 },
  platforms: [
    ground(0, 2900),
    { x: 700, y: 420, w: 80, h: 18, style: "stone" },
    { x: 1150, y: 400, w: 80, h: 18, style: "stone" },
    { x: 1600, y: 420, w: 80, h: 18, style: "stone" },
    { x: 2050, y: 400, w: 80, h: 18, style: "stone" },
  ],
  // tiny scattered shade pockets only
  shade: [
    { x: 0, y: 360, w: 130, h: 200, style: "tent" },
    { x: 380, y: 380, w: 90, h: 180, style: "tent" },
    { x: 720, y: 360, w: 90, h: 200, style: "tent" },
    { x: 1160, y: 340, w: 90, h: 220, style: "tent" },
    { x: 1610, y: 360, w: 90, h: 200, style: "tent" },
    { x: 2060, y: 340, w: 90, h: 220, style: "tent" },
    { x: 2700, y: 320, w: 200, h: 240, style: "building" },
  ],
  movingShade: [
    { x: 500, y: 140, w: 140, h: 24, style: "cloud", castsShade: true, move: { axis: "x", min: 200, max: 1000, speed: 70 } },
    { x: 1900, y: 140, w: 140, h: 24, style: "cloud", castsShade: true, move: { axis: "x", min: 1700, max: 2500, speed: -65 } },
  ],
  collectibles: [
    { x: 720, y: 380, w: 22, h: 22, kind: "token", id: "l5t1" },
    { x: 1160, y: 360, w: 22, h: 22, kind: "moon", id: "l5m1" },
    { x: 1600, y: 380, w: 22, h: 22, kind: "token", id: "l5t2" },
    { x: 2050, y: 360, w: 22, h: 22, kind: "moon", id: "l5m2" },
    { x: 2400, y: 430, w: 22, h: 22, kind: "moon", id: "l5m3", secret: true, label: "Mirage Moon" },
    { x: 2730, y: 380, w: 26, h: 26, kind: "sticker", id: "l5s1", label: "Lost Coffin: Heatwave Plaza", secret: true },
  ],
  bouncePads: [],
  checkpoints: [{ x: 1380, y: 440, w: 30, h: 60, id: "l5c1" }],
  dialogue: [
    { id: "l5d0", x: 40, lines: ["NOX: ...This is the bad one. The sun is directly overhead.", "NOX: Shadows are tiny. Plan every step between the tents.", "NOX: Save your bat shields for the long open stretches."] },
    { id: "l5d1", x: 1380, lines: ["NOX: Halfway. Breathe. Then sprint to the next shadow."] },
  ],
  puzzle: "none",
  hint: "Hop tent to tent. Use bat shields to cross the open gaps.",
};

/* ----------------------------- LEVEL 6: SUNSET -------------------------- */
const level6: Level = {
  id: 6,
  theme: {
    name: "Sunset",
    subtitle: "Walk home",
    skyTop: "#ff9e6d",
    skyBottom: "#5b3a78",
    ground: "#6b4a78",
    accent: "#ffd36b",
    drain: 0,
    music: "sunset",
    sunStage: 6,
  },
  worldW: 2600,
  worldH: WORLD_H,
  spawn: { x: 50, y: 440 },
  goal: { x: 2480, y: 380, w: 90, h: 120 },
  platforms: [ground(0, 2600)],
  shade: [],
  movingShade: [],
  collectibles: [],
  bouncePads: [],
  checkpoints: [],
  npcs: [
    { x: 500, y: 430, w: 40, h: 60, who: "Sushi Chef", line: "Chef: You made it past the belts! Come back hungry." },
    { x: 1000, y: 430, w: 40, h: 60, who: "Beach Bum", line: "Surfer: Whoa, the little night guy! Righteous escape." },
    { x: 1500, y: 430, w: 40, h: 60, who: "Parade Dancer", line: "Dancer: You played the whole rainbow! Encore!" },
    { x: 2000, y: 430, w: 40, h: 60, who: "Garden Keeper", line: "Keeper: The cipher remembers you fondly, little one." },
  ],
  dialogue: [
    { id: "l6d0", x: 40, lines: ["NOX: It's over. The sun's going down.", "NOX: Take your time, boss. Just walk. We earned this."] },
    { id: "l6d1", x: 2200, lines: ["NOX: There it is. Home.", "NOX: One foot in front of the other."] },
  ],
  puzzle: "narrative",
  hint: "Just walk home.",
};

export const LEVELS: Level[] = [level1, level2, level3, level4, level5, level6];

export const SUN_STAGES = ["SUNRISE", "MORNING", "NOON", "AFTERNOON", "SUNSET"];
