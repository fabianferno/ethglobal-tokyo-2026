import { choice, noul } from "@typesafe-ai/sdk";

/**
 * The Jev question schema. Every question is answered in parallel against the same text,
 * so we ask everything every time (speculative fan-out) and code decides what matters.
 *
 * Rules: criteria are self-contained and non-overlapping, every question has an escape option,
 * and we never ask Jev to extract values, count, or do math.
 */
export const baseQuestions = {
  shell: choice("Which familiar desktop program does the person want this app to look or behave like", {
    excel: "A spreadsheet like Microsoft Excel: rows, columns, cells, formulas, a table or sheet",
    minesweeper: "The Minesweeper game: a grid of hidden tiles and mines",
    doom: "A first-person shooter game like DOOM, Wolfenstein or Quake: a 3D corridor with monsters, a gun, health and ammo",
    paint: "A drawing program like MS Paint: a canvas, picture, image, meme or artwork",
    weather: "A weather app or forecast: sunny, stormy, temperature, climate",
    notepad: "A plain text editor like Notepad: a diary, journal, notes or log",
    hologram: "A rotating 3D or three-dimensional visualization: a spinning 3-D bar chart, wireframe, hologram, or an old OpenGL/DirectX screensaver look",
    explorer: "A regular app window or dashboard, file browser or control panel",
    unspecified: "No particular program is named or implied",
  }),

  shape: choice("What kind of content should the app show", {
    table: "Rows and columns of facts or numbers: a ranking, a comparison, a schedule, a sheet",
    list: "A short list of items, tips, picks or steps",
    series: "Numbers changing over time: a trend, a line or bar chart, history",
    gauge: "One value on a scale with a short forecast: a mood, a level, a rating, a meter",
    scene: "A punchy poster: a headline, a verdict and a few one-liners, like a roast, a pep talk or a fortune",
    grid: "A board of cells to uncover or fight through, each with a danger level: a game board",
    doc: "A piece of writing: a story, a letter, a diary entry, a poem, notes",
    picture: "Mainly an image or drawing of something",
  }),

  vibe: choice("What tone should the app have", {
    serious: "Professional and factual",
    playful: "Fun, game-like or silly",
    roast: "Mocking or sarcastic",
    hype: "Excited and over the top",
    chill: "Calm and relaxed",
  }),

  scene: choice("Which animation best fits the app", {
    sparkle: "Magic, celebration, stars, something delightful",
    ticker: "Scrolling numbers, news, scores or data",
    storm: "Danger, chaos, drama or bad news",
    rocket: "Growth, speed, launches, going up",
    sakura: "Friends, community, Japan, gentle",
    pool: "Water, travel, summer, calm",
    fire: "Roasting, intensity, heat",
    none: "No animation fits",
  }),

  nonsense: noul("The text is gibberish or is not a request for any kind of app, game, document or picture"),
};

export const QUESTION_COUNT = Object.keys(baseQuestions).length;
