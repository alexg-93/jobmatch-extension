// eslint.config.js — flat config (ESLint 9+)
const js = require("@eslint/js");

const webExtensionGlobals = {
  chrome: "readonly",
  LanguageModel: "readonly",
  ai: "readonly",
  importScripts: "readonly" // service worker (background.js) only, but harmless elsewhere
};

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  location: "readonly",
  navigator: "readonly",
  console: "readonly",
  fetch: "readonly",
  URL: "readonly",
  MutationObserver: "readonly",
  AbortController: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  Promise: "readonly",
  confirm: "readonly",
  module: "writable",
  self: "readonly"
};

const nodeGlobals = {
  require: "readonly",
  module: "writable",
  process: "readonly",
  __dirname: "readonly",
  global: "readonly",
  globalThis: "readonly"
};

module.exports = [
  js.configs.recommended,
  {
    ignores: ["lib/**", "node_modules/**", "*.zip"]
  },
  {
    // Content scripts, popup, offscreen, background: all run in a browser
    // (or MV3 service worker) with the chrome.* extension APIs available.
    files: ["content/**/*.js", "popup/**/*.js", "offscreen/**/*.js", "background.js", "shared/matcher.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...browserGlobals, ...webExtensionGlobals, ...nodeGlobals, pdfjsLib: "readonly" }
    },
    rules: {
      // Caught errors are frequently ignored on purpose throughout this codebase
      // (best-effort cleanup, "extension context invalidated" guards, etc).
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }]
    }
  },
  {
    // Test suite runs under plain Node with the built-in test runner.
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...nodeGlobals, globalThis: "writable" }
    }
  },
  {
    files: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: nodeGlobals
    }
  }
];
