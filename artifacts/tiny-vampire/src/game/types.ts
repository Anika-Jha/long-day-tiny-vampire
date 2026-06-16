export type Vec2 = { x: number; y: number };

export type Rect = { x: number; y: number; w: number; h: number };

export type Platform = Rect & {
  /** moving platform horizontal velocity (px/s), e.g. conveyor belts */
  conveyor?: number;
  /** patrol motion: object oscillates between min and max along an axis */
  move?: {
    axis: "x" | "y";
    min: number;
    max: number;
    speed: number;
    phase?: number;
  };
  /** styling hint for the renderer */
  style?: "ground" | "tray" | "wood" | "stone" | "bridge" | "petal" | "cloud";
  /** whether this platform also casts shade in the column below it */
  castsShade?: boolean;
  /** internal runtime offset for moving platforms */
  _ox?: number;
  _oy?: number;
};

export type ShadeZone = Rect & {
  style?: "umbrella" | "building" | "tree" | "awning" | "cloud" | "tent";
};

export type Collectible = Rect & {
  /**
   * memory  — a Solstice Memory (glowing fragment of a summer moment; builds the scrapbook)
   * token   — a bat token (grants a shield charge)
   * postcard— a postcard left behind by the coffin (humorous note)
   * note    — a hidden Encrypted Note (collect all to unlock the secret ending)
   */
  kind: "memory" | "token" | "postcard" | "note";
  id: string;
  /** marks a secret/hidden collectible for the "Paths Not Taken" screen */
  secret?: boolean;
  /** short display name (memory title, postcard sender, etc.) */
  label?: string;
  /** longer description shown in the scrapbook / on pickup */
  desc?: string;
  collected?: boolean;
};

/** Who is speaking a line of dialogue. */
export type Speaker = "nox" | "sun";

export type BouncePad = Rect & {
  power: number;
  dir?: Vec2;
  style?: "flipflop" | "spring";
};

export type Checkpoint = Rect & { id: string; reached?: boolean };

export type Hazard = Rect & { kind: "spill" | "gap" };

/** Sequence pad for the music/bridge puzzle (Level 3). */
export type SeqPad = Rect & {
  order: number;
  color: string;
  note: number;
  active?: boolean;
};

/** Lever for the logic puzzle (Level 4). */
export type Lever = Rect & {
  id: number;
  on?: boolean;
  symbol: string;
  _cool?: boolean;
};

export type Gate = Rect & { open?: boolean };

export type NpcMarker = Rect & { who: string; line: string; _fired?: boolean };

export type DialogueTrigger = {
  id: string;
  x: number;
  lines: string[];
  fired?: boolean;
};

export type LevelTheme = {
  name: string;
  subtitle: string;
  /** sky gradient top/bottom */
  skyTop: string;
  skyBottom: string;
  ground: string;
  accent: string;
  /** sun drain multiplier for this level */
  drain: number;
  /** soundtrack id */
  music: string;
  /** index on the solstice tracker 0..5 */
  sunStage: number;
  /** the Sun's narrator comment for this level (Sun is ancient, calm, curious, amused) */
  sunLine?: string;
};

export type PuzzleKind = "none" | "sequence" | "levers" | "narrative";

export type Level = {
  id: number;
  theme: LevelTheme;
  worldW: number;
  worldH: number;
  spawn: Vec2;
  goal: Rect;
  platforms: Platform[];
  shade: ShadeZone[];
  movingShade: Platform[];
  collectibles: Collectible[];
  bouncePads: BouncePad[];
  checkpoints: Checkpoint[];
  seqPads?: SeqPad[];
  levers?: Lever[];
  gate?: Gate;
  npcs?: NpcMarker[];
  dialogue: DialogueTrigger[];
  puzzle: PuzzleKind;
  /** the correct lever combination (Level 4), as booleans by id */
  leverSolution?: boolean[];
  hint?: string;
};

export type GameScreen =
  | "title"
  | "intro"
  | "playing"
  | "death"
  | "levelComplete"
  | "ending"
  | "credits"
  | "secret";

export type Stats = {
  memoryTotal: number;
  memoryFound: number;
  tokensFound: number;
  postcardsTotal: number;
  postcardsFound: number;
  notesTotal: number;
  notesFound: number;
};

/** A collected Solstice Memory, surfaced in the ending scrapbook. */
export type MemoryEntry = { id: string; label: string; desc: string };
