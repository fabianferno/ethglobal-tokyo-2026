/**
 * The Jev question schema, in OpenAI Decisions API form. Every question is answered in parallel against
 * the same text in one request, so we ask everything every time (speculative fan-out) and code decides
 * what matters.
 *
 * Rules: descriptions are self-contained and non-overlapping, every choice has an escape option,
 * and we never ask the model to extract values, count, or do math.
 */
export type ChoiceQuestion = { type: "choice"; name: string; instructions: string; choices: { value: string; description: string }[] };
export type PredicateQuestion = { type: "predicate"; name: string; instructions: string };

export const QUESTIONS: (ChoiceQuestion | PredicateQuestion)[] = [
  {
    type: "choice",
    name: "shell",
    instructions: "Which familiar desktop program does the person want this app to look or behave like",
    choices: [
      { value: "excel", description: "A spreadsheet like Microsoft Excel: rows, columns, cells, formulas, a table or sheet" },
      { value: "minesweeper", description: "The Minesweeper game: a grid of hidden tiles and mines" },
      { value: "doom", description: "A first-person shooter game like DOOM, Wolfenstein or Quake: a 3D corridor with monsters, a gun, health and ammo" },
      { value: "paint", description: "A drawing program like MS Paint: a canvas, picture, image, meme or artwork" },
      { value: "weather", description: "A weather app or forecast: sunny, stormy, temperature, climate" },
      { value: "notepad", description: "A plain text editor like Notepad: a diary, journal, notes or log" },
      { value: "hologram", description: "A rotating 3D or three-dimensional visualization: a spinning 3-D bar chart, wireframe, hologram, or an old OpenGL/DirectX screensaver look" },
      { value: "explorer", description: "A regular app window or dashboard, file browser or control panel" },
      { value: "unspecified", description: "No particular program is named or implied" },
    ],
  },
  {
    type: "choice",
    name: "shape",
    instructions: "What kind of content should the app show",
    choices: [
      { value: "table", description: "Rows and columns of facts or numbers: a ranking, a comparison, a schedule, a sheet" },
      { value: "list", description: "A short list of items, tips, picks or steps" },
      { value: "series", description: "Numbers changing over time: a trend, a line or bar chart, history" },
      { value: "gauge", description: "One value on a scale with a short forecast: a mood, a level, a rating, a meter" },
      { value: "scene", description: "A punchy poster: a headline, a verdict and a few one-liners, like a roast, a pep talk or a fortune" },
      { value: "grid", description: "A board of cells to uncover or fight through, each with a danger level: a game board" },
      { value: "doc", description: "A piece of writing: a story, a letter, a diary entry, a poem, notes" },
      { value: "picture", description: "Mainly an image or drawing of something" },
    ],
  },
  {
    type: "choice",
    name: "vibe",
    instructions: "What tone should the app have",
    choices: [
      { value: "serious", description: "Professional and factual" },
      { value: "playful", description: "Fun, game-like or silly" },
      { value: "roast", description: "Mocking or sarcastic" },
      { value: "hype", description: "Excited and over the top" },
      { value: "chill", description: "Calm and relaxed" },
    ],
  },
  {
    type: "choice",
    name: "scene",
    instructions: "Which animation best fits the app",
    choices: [
      { value: "sparkle", description: "Magic, celebration, stars, something delightful" },
      { value: "ticker", description: "Scrolling numbers, news, scores or data" },
      { value: "storm", description: "Danger, chaos, drama or bad news" },
      { value: "rocket", description: "Growth, speed, launches, going up" },
      { value: "sakura", description: "Friends, community, Japan, gentle" },
      { value: "pool", description: "Water, travel, summer, calm" },
      { value: "fire", description: "Roasting, intensity, heat" },
      { value: "none", description: "No animation fits" },
    ],
  },
  { type: "predicate", name: "nonsense", instructions: "The text is gibberish or is not a request for any kind of app, game, document or picture" },
];

export const QUESTION_COUNT = QUESTIONS.length;
