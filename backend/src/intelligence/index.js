const engine = require("./engine");
const indexer = require("./indexer");
const parsers = require("./parsers");
const { startWatcher, stopWatcher, notifyFileChange } = require("./watcher");

function initIntelligence() {
  startWatcher();
  return { ok: true, languages: parsers.supportedLanguages() };
}

module.exports = {
  ...engine,
  indexer,
  parsers,
  initIntelligence,
  startWatcher,
  stopWatcher,
  notifyFileChange,
};
