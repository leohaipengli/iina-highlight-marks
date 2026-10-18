/* Highlight Marks. No dependencies. See SECURITY.md for the API inventory. */
(function () {
  "use strict";

  const DATABASE = "@data/marks.json";
  const BACKUP = "@data/marks.backup.json";
  let undoChange = null;
  let windowLoaded = false;
  let windowReady = false;
  let lastExport = null;

  function timecode(seconds) {
    const total = Math.round(seconds * 1000);
    const ms = String(total % 1000).padStart(3, "0");
    const s = String(Math.floor(total / 1000) % 60).padStart(2, "0");
    const m = String(Math.floor(total / 60000) % 60).padStart(2, "0");
    const h = String(Math.floor(total / 3600000)).padStart(2, "0");
    return h + ":" + m + ":" + s + "." + ms;
  }

  function source() {
    // IINA 1.4.4 exposes url and position; NOT path or currentTime.
    // status.url is already percent-decoded by IINA. Do not decode it again.
    const url = iina.core.status.url;
    if (iina.core.status.isNetworkResource || typeof url !== "string" ||
        url.indexOf("file:///") !== 0 || iina.core.status.idle) {
      throw new Error("Open a local video in this player first.");
    }
    const path = url.slice(7);
    const duration = iina.core.status.duration;
    return {
      path: path,
      title: iina.core.status.title || path.split("/").pop(),
      duration_seconds: typeof duration === "number" && Number.isFinite(duration) && duration > 0
        ? duration : null
    };
  }

  function validMark(mark) {
    return mark && typeof mark.id === "string" && typeof mark.timestamp_seconds === "number" &&
      Number.isFinite(mark.timestamp_seconds) && mark.timestamp_seconds >= 0 &&
      typeof mark.note === "string" && typeof mark.created_at === "string";
  }

  function readDatabase() {
    if (!iina.file.exists(DATABASE)) return { version: 1, videos: [] };
    const data = JSON.parse(iina.file.read(DATABASE, {}));
    if (!data || data.version !== 1 || !Array.isArray(data.videos) ||
        !data.videos.every(function (video) {
          return video && typeof video.path === "string" && Array.isArray(video.marks) &&
            video.marks.every(validMark);
        })) {
      throw new Error("Saved marks are invalid. The original file has been left untouched.");
    }
    return data;
  }

  function writeDatabase(data) {
    // Read fresh for every operation, including across multiple player windows.
    // IINA writes these files atomically. Never accept a file path from the UI.
    if (iina.file.exists(DATABASE)) {
      iina.file.write(BACKUP, iina.file.read(DATABASE, {}));
    }
    iina.file.write(DATABASE, JSON.stringify(data, null, 2));
  }

  function videoIn(data, current, create) {
    let video = data.videos.find(function (item) { return item.path === current.path; });
    if (!video && create) {
      video = { path: current.path, title: current.title,
        duration_seconds: current.duration_seconds, marks: [] };
      data.videos.push(video);
    }
    return video;
  }

  function sorted(marks) {
    return marks.slice().sort(function (a, b) { return a.timestamp_seconds - b.timestamp_seconds; });
  }

  function exportDocument(current, marks) {
    return {
      format: "highlight-marks",
      version: 1,
      timestamp_semantics: "point_of_interest",
      source: current,
      marks: sorted(marks).map(function (mark) {
        return { id: mark.id, timestamp_seconds: mark.timestamp_seconds,
          timecode: timecode(mark.timestamp_seconds), note: mark.note, created_at: mark.created_at };
      })
    };
  }

  function tell(message) { iina.core.osd(message); }

  function send(name, value) {
    // Older IINA bridges interpolate JSON into a JavaScript template literal.
    // Encode ALL data so filenames/notes containing backticks or ${...} stay data.
    if (windowReady) {
      iina.standaloneWindow.postMessage(name, { encoded: encodeURIComponent(JSON.stringify(value)) });
    }
  }

  function publish(notice) {
    if (!windowReady) return;
    try {
      const current = source();
      const video = videoIn(readDatabase(), current, false);
      const marks = video ? sorted(video.marks) : [];
      send("state", { source: current, marks: marks,
        json: JSON.stringify(exportDocument(current, marks), null, 2),
        canUndo: !!undoChange, notice: notice || "" });
    } catch (error) {
      send("state", { source: null, marks: [], json: "", canUndo: !!undoChange,
        notice: error.message || String(error) });
    }
  }

  function guarded(action) {
    return function (payload) {
      try { action(payload); }
      catch (error) {
        const message = error.message || String(error);
        tell(message);
        send("notice", { message: message, error: true });
      }
    };
  }

  function addMark() {
    const current = source();
    // getNative returns null if playback time is unavailable; never substitute zero.
    const position = iina.mpv.getNative("time-pos");
    if (typeof position !== "number" || !Number.isFinite(position) || position < 0) {
      throw new Error("Playback position is not available yet. Try again after the video loads.");
    }
    const data = readDatabase();
    const video = videoIn(data, current, true);
    if (video.marks.some(function (mark) { return mark.timestamp_seconds === position; })) {
      tell("This exact moment is already marked.");
      return;
    }
    const mark = { id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
      timestamp_seconds: position, note: "", created_at: new Date().toISOString() };
    video.title = current.title;
    video.duration_seconds = current.duration_seconds;
    video.marks.push(mark);
    writeDatabase(data);
    undoChange = { path: current.path, id: mark.id, before: null,
      after: Object.assign({}, mark) };
    tell("Marked " + timecode(position));
    publish();
  }

  function matchingVideo(data, payload) {
    const current = source();
    if (!payload || payload.path !== current.path || typeof payload.id !== "string") {
      throw new Error("The video changed. Refresh the marks window and try again.");
    }
    const video = videoIn(data, current, false);
    if (!video) throw new Error("This mark no longer exists.");
    return video;
  }

  function editMark(payload, remove) {
    const data = readDatabase();
    const video = matchingVideo(data, payload);
    const index = video.marks.findIndex(function (mark) { return mark.id === payload.id; });
    if (index < 0) throw new Error("This mark no longer exists. Refresh the window.");
    const before = Object.assign({}, video.marks[index]);
    if (remove) video.marks.splice(index, 1);
    else {
      if (typeof payload.note !== "string" || payload.note.length > 2000) {
        throw new Error("Keep notes to 2,000 characters or fewer.");
      }
      if (payload.note === before.note) return;
      video.marks[index].note = payload.note;
    }
    writeDatabase(data);
    undoChange = { path: video.path, id: payload.id, before: before,
      after: remove ? null : Object.assign({}, video.marks[index]) };
    publish(remove ? "Mark removed. Undo is available." : "Note saved.");
  }

  function undo() {
    if (!undoChange) { tell("Nothing to undo in this player session."); return; }
    const current = source();
    if (current.path !== undoChange.path) {
      throw new Error("Return to the video where you made the last change to undo it.");
    }
    const data = readDatabase();
    const video = videoIn(data, current, false);
    if (!video) throw new Error("The original marks are unavailable.");
    const index = video.marks.findIndex(function (mark) { return mark.id === undoChange.id; });
    if (undoChange.before === null) {
      if (index < 0) throw new Error("That mark was already removed.");
      if (JSON.stringify(video.marks[index]) !== JSON.stringify(undoChange.after)) {
        throw new Error("That mark changed in another window. Refresh before editing it.");
      }
      video.marks.splice(index, 1);
    } else {
      // Do not silently overwrite a change made in another player window.
      if (undoChange.after === null && index >= 0 || undoChange.after !== null &&
          (index < 0 || JSON.stringify(video.marks[index]) !== JSON.stringify(undoChange.after))) {
        throw new Error("That mark changed in another window. Refresh before editing it.");
      }
      if (index >= 0) video.marks[index] = undoChange.before;
      else video.marks.push(undoChange.before);
    }
    writeDatabase(data);
    undoChange = null;
    tell("Last change undone.");
    publish("Last change undone.");
  }

  function seekMark(payload) {
    const video = matchingVideo(readDatabase(), payload);
    const mark = video.marks.find(function (item) { return item.id === payload.id; });
    if (!mark) throw new Error("This mark no longer exists.");
    iina.core.seekTo(mark.timestamp_seconds);
  }

  function exportMarks() {
    const current = source();
    const video = videoIn(readDatabase(), current, false);
    if (!video || !video.marks.length) throw new Error("Mark at least one moment before exporting.");
    const stem = current.path.split("/").pop().replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "video";
    const base = "@data/" + stem + "-marks-" + Date.now();
    let destination = base + ".json";
    let count = 1;
    while (iina.file.exists(destination)) { destination = base + "-" + count++ + ".json"; }
    iina.file.write(destination, JSON.stringify(exportDocument(current, video.marks), null, 2));
    lastExport = destination;
    iina.file.showInFinder(destination);
    tell("Exported " + video.marks.length + " marks. JSON selected in Finder.");
    publish("Export saved. The JSON file is selected in Finder; drag it into your AI chat.");
  }

  function openReview() {
    if (!windowLoaded) {
      // loadFile clears the host's message listeners, so register AFTER loading.
      iina.standaloneWindow.loadFile("review.html");
      iina.standaloneWindow.onMessage("ready", function () { windowReady = true; publish(); });
      iina.standaloneWindow.onMessage("refresh", guarded(function () { publish(); }));
      iina.standaloneWindow.onMessage("mark", guarded(addMark));
      iina.standaloneWindow.onMessage("undo", guarded(undo));
      iina.standaloneWindow.onMessage("seek", guarded(seekMark));
      iina.standaloneWindow.onMessage("delete", guarded(function (p) { editMark(p, true); }));
      iina.standaloneWindow.onMessage("note", guarded(function (p) { editMark(p, false); }));
      iina.standaloneWindow.onMessage("export", guarded(exportMarks));
      iina.standaloneWindow.setProperty({ title: "Review Moments", resizable: true });
      iina.standaloneWindow.setFrame(760, 560, null, null);
      windowLoaded = true;
    }
    iina.standaloneWindow.open();
    publish();
  }

  function menu(title, action, binding) {
    iina.menu.addItem(iina.menu.item(title, guarded(action), binding ? { keyBinding: binding } : {}));
  }
  menu("Mark Current Moment", addMark, "Ctrl+b");
  menu("Undo Last Change", undo, "Ctrl+Shift+b");
  iina.menu.addItem(iina.menu.separator());
  menu("Review Marks…", openReview, "Ctrl+Shift+m");
  menu("Export This Video’s Marks…", exportMarks, "Ctrl+Shift+e");
  menu("Show Saved Data in Finder", function () {
    if (lastExport) iina.file.showInFinder(lastExport);
    else if (iina.file.exists(DATABASE)) iina.file.showInFinder(DATABASE);
    else tell("No marks saved yet.");
  });
  iina.event.on("mpv.file-loaded", function () { publish(); });
  iina.event.on("mpv.end-file", function () { publish(); });
}());
