"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const plugin = path.join(__dirname, "../plugin");
const entry = fs.readFileSync(path.join(plugin, "main.js"), "utf8");

function player(sharedFiles) {
  const files = sharedFiles || new Map();
  const menus = new Map();
  const listeners = new Map();
  const events = new Map();
  const messages = [];
  const osd = [];
  const reveals = [];
  const writes = [];
  const seeks = [];
  const status = { url: "file:///Movies/day.mp4", title: "Day", duration: 180,
    isNetworkResource: false, idle: false };
  let position = 12.345678;
  let failWrites = false;
  const ownPath = function (p) {
    assert.match(p, /^@data\/[a-zA-Z0-9_.-]+$/);
    return p;
  };
  const api = {
    core: { status, osd: (s) => osd.push(s), seekTo: (s) => seeks.push(s) },
    mpv: { getNative: (property) => { assert.equal(property, "time-pos"); return position; } },
    file: {
      exists: (p) => files.has(ownPath(p)),
      read: (p, options) => { assert.deepEqual(JSON.parse(JSON.stringify(options)), {}); return files.get(ownPath(p)); },
      write: (p, content) => {
        ownPath(p);
        if (failWrites) throw new Error("Disk unavailable");
        writes.push(p);
        files.set(p, content);
      },
      showInFinder: (p) => reveals.push(ownPath(p))
    },
    menu: {
      item: (title, action, options) => ({ title, action, options }),
      addItem: (item) => { if (item.title) menus.set(item.title, item); },
      separator: () => ({})
    },
    event: { on: (name, callback) => events.set(name, callback) },
    standaloneWindow: {
      loadFile: (p) => { assert.equal(p, "review.html"); listeners.clear(); },
      onMessage: (name, callback) => listeners.set(name, callback),
      postMessage: (name, data) => messages.push({ name, data: JSON.parse(JSON.stringify(data)) }),
      setProperty: () => {}, setFrame: () => {}, open: () => {}
    }
  };
  vm.runInNewContext(entry, { iina: api });
  const click = (title) => { assert.ok(menus.has(title), title); menus.get(title).action(); };
  const open = () => { click("Review Marks…"); listeners.get("ready")({}); };
  const message = (name, data = {}) => { assert.ok(listeners.has(name), name); listeners.get(name)(data); };
  const state = () => JSON.parse(decodeURIComponent(messages.filter(m => m.name === "state").at(-1).data.encoded));
  return { files, menus, messages, osd, reveals, writes, seeks, status, events, click, open, message, state,
    time: (s) => { position = s; }, failWrites: () => { failWrites = true; },
    db: () => JSON.parse(files.get("@data/marks.json")) };
}

test("exact source seconds survive restart, including zero and nearby moments", () => {
  const a = player();
  for (const time of [0, 12.345678, 12.4]) { a.time(time); a.click("Mark Current Moment"); }
  a.click("Mark Current Moment"); // only an identical timestamp is deduplicated
  assert.deepEqual(a.db().videos[0].marks.map(m => m.timestamp_seconds), [0, 12.345678, 12.4]);
  const b = player(a.files);
  b.open();
  assert.equal(b.state().marks.length, 3);
  assert.equal(b.menus.get("Mark Current Moment").options.keyBinding, "Ctrl+b");
});

test("missing playback time, network URLs and idle players never produce a false zero", () => {
  for (const time of [null, undefined, NaN, Infinity, -1, "0"]) {
    const p = player(); p.time(time); p.click("Mark Current Moment");
    assert.equal(p.writes.length, 0);
  }
  for (const update of [{ url: "https://example.test/video.mp4" }, { isNetworkResource: true }, { idle: true }]) {
    const p = player(); Object.assign(p.status, update); p.click("Mark Current Moment");
    assert.equal(p.writes.length, 0);
  }
});

test("export includes only this video, keeps point timestamps, and stays private", () => {
  const p = player(); p.click("Mark Current Moment");
  p.status.url = "file:///Movies/other.mp4"; p.time(70); p.click("Mark Current Moment");
  p.click("Export This Video’s Marks…");
  const exported = JSON.parse(p.files.get(p.reveals[0]));
  assert.equal(exported.source.path, "/Movies/other.mp4");
  assert.equal(exported.marks.length, 1);
  assert.equal(exported.marks[0].timestamp_seconds, 70);
  assert.equal(exported.timestamp_semantics, "point_of_interest");
  assert.equal(exported.format, "highlight-marks");
  assert.equal(exported.editing_preferences, undefined);
  assert.deepEqual(Object.keys(exported.marks[0]).sort(), ["id", "timestamp_seconds", "timecode", "note", "created_at"].sort());
  p.click("Export This Video’s Marks…");
  assert.notEqual(p.reveals[0], p.reveals[1]);
});

test("filenames and notes stay data across IINA's template-literal message bridge", () => {
  const p = player();
  const dangerous = "` ${globalThis.pwned = true} <script>oops</script> 雪 %20 🎥";
  p.status.url = "file:///Movies/" + dangerous + ".mp4";
  p.status.title = dangerous;
  p.click("Mark Current Moment"); p.open();
  const mark = p.state().marks[0];
  p.message("note", { path: p.state().source.path, id: mark.id, note: dangerous });
  const envelope = p.messages.filter(m => m.name === "state").at(-1).data;
  const raw = JSON.stringify(envelope);
  assert.equal(raw.includes("`"), false);
  assert.equal(raw.includes("${"), false);
  const host = { window: { iina: { _emit: (_name, value) => {
    assert.equal(JSON.parse(decodeURIComponent(JSON.parse(value).encoded)).marks[0].note, dangerous);
  } } } };
  vm.runInNewContext("window.iina._emit(`state`, String.raw`" + raw + "`)", host);
  assert.equal(host.pwned, undefined);
  p.click("Export This Video’s Marks…");
  assert.equal(JSON.parse(p.files.get(p.reveals[0])).source.path, "/Movies/" + dangerous + ".mp4");
});

test("two player windows preserve each other's marks and prevent conflicting undo", () => {
  const files = new Map(); const a = player(files); const b = player(files);
  a.time(10); a.click("Mark Current Moment");
  b.time(20); b.click("Mark Current Moment");
  a.open(); b.open();
  const mark = a.state().marks[0];
  b.message("note", { path: b.state().source.path, id: mark.id, note: "Keep this" });
  a.click("Undo Last Change");
  assert.equal(a.db().videos[0].marks.length, 2);
  assert.match(a.osd.at(-1), /changed in another window/);
});

test("remove, note edits and additions can be undone without losing other marks", () => {
  const p = player(); p.click("Mark Current Moment"); p.open();
  const mark = p.state().marks[0]; const payload = { path: p.state().source.path, id: mark.id };
  p.message("note", { ...payload, note: "Catch" });
  p.click("Undo Last Change"); assert.equal(p.state().marks[0].note, "");
  p.message("delete", payload); assert.equal(p.state().marks.length, 0);
  p.click("Undo Last Change"); assert.equal(p.state().marks.length, 1);
  p.time(40); p.click("Mark Current Moment");
  p.click("Undo Last Change"); assert.equal(p.state().marks.length, 1);
  assert.ok(p.files.has("@data/marks.backup.json"));
});

test("stale review actions, corrupt storage and failed writes leave saved data intact", () => {
  const p = player(); p.click("Mark Current Moment"); p.open();
  const before = p.files.get("@data/marks.json");
  const payload = { path: p.state().source.path, id: p.state().marks[0].id };
  p.status.url = "file:///Movies/new.mp4"; p.message("delete", payload);
  assert.equal(p.files.get("@data/marks.json"), before);
  p.status.url = "file:///Movies/day.mp4"; p.failWrites(); p.time(40); p.click("Mark Current Moment");
  assert.equal(p.files.get("@data/marks.json"), before);
  const broken = player(new Map([["@data/marks.json", "{broken"]]));
  broken.click("Mark Current Moment");
  assert.equal(broken.files.get("@data/marks.json"), "{broken");
  assert.equal(broken.writes.length, 0);
});

test("only allowlisted APIs and permission are present; UI forbids remote resources", () => {
  const info = JSON.parse(fs.readFileSync(path.join(plugin, "Info.json")));
  assert.deepEqual(info.permissions, ["show-osd"]);
  assert.deepEqual(info.allowedDomains, []);
  assert.equal(info.ghRepo, undefined); assert.equal(info.ghVersion, undefined);
  assert.doesNotMatch(entry, /iina\.(?:http|ws|utils|overlay|playlist|subtitle|preferences)\b/);
  assert.doesNotMatch(entry, /\.(?:exec|command|evaluateJavaScript)\s*\(|\beval\s*\(|new\s+Function\b/);
  const html = fs.readFileSync(path.join(plugin, "review.html"), "utf8");
  assert.match(html, /connect-src 'none'/);
  const ui = fs.readFileSync(path.join(plugin, "review.js"), "utf8");
  assert.doesNotMatch(ui, /innerHTML|outerHTML|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});
