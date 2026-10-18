(function () {
  "use strict";
  const byId = function (id) { return document.getElementById(id); };
  let currentPath = null;
  let busy = false;

  function post(name, data) { window.iina.postMessage(name, data || {}); }
  function decode(envelope) { return JSON.parse(decodeURIComponent(envelope.encoded)); }
  function notice(message) { byId("notice").textContent = message || ""; }
  function format(seconds) {
    const ms = Math.round(seconds * 1000);
    return [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60]
      .map(function (n) { return String(n).padStart(2, "0"); }).join(":") + "." + String(ms % 1000).padStart(3, "0");
  }
  function button(label, action, className) {
    const node = document.createElement("button");
    node.textContent = label;
    if (className) node.className = className;
    node.addEventListener("click", action);
    return node;
  }

  function render(envelope) {
    const state = decode(envelope);
    // Keep an in-progress note intact if playback changes in another window.
    if (busy) { notice("Marks changed. Save or cancel your note, then refresh."); return; }
    currentPath = state.source ? state.source.path : null;
    byId("source-title").textContent = state.source ? state.source.title : "Open a local video in IINA";
    byId("source-path").textContent = currentPath || "Choose a video, then refresh this window.";
    byId("count").textContent = state.marks.length + " saved";
    byId("empty").hidden = state.marks.length > 0;
    byId("mark").disabled = !currentPath;
    byId("export").disabled = !state.marks.length;
    byId("undo").disabled = !state.canUndo;
    byId("json").value = state.json;
    byId("select-json").disabled = !state.json;
    notice(state.notice);
    const list = byId("marks");
    list.textContent = "";
    state.marks.forEach(function (mark, index) {
      const row = document.createElement("li");
      const top = document.createElement("div");
      top.className = "mark-top";
      const label = document.createElement("span");
      label.className = "mark-number";
      label.textContent = String(index + 1).padStart(2, "0");
      const path = currentPath;
      const payload = function () { return { id: mark.id, path: path }; };
      const seek = button(format(mark.timestamp_seconds), function () { post("seek", payload()); }, "timecode");
      seek.setAttribute("aria-label", "Jump to " + format(mark.timestamp_seconds));
      const actions = document.createElement("div");
      actions.className = "mark-actions";
      const noteText = document.createElement("p");
      noteText.className = mark.note ? "note-text" : "note-text muted";
      noteText.textContent = mark.note || "No note";
      const edit = button(mark.note ? "Edit note" : "Add note", function () {
        if (busy) return;
        busy = true;
        edit.disabled = true;
        const editor = document.createElement("div");
        editor.className = "note-editor";
        const input = document.createElement("textarea");
        input.value = mark.note;
        input.maxLength = 2000;
        input.setAttribute("aria-label", "Note for " + format(mark.timestamp_seconds));
        const save = button("Save note", function () {
          busy = false;
          const data = payload();
          data.note = input.value;
          post("note", data);
          post("refresh");
        }, "primary");
        const cancel = button("Cancel", function () { busy = false; post("refresh"); });
        editor.appendChild(input);
        editor.appendChild(save);
        editor.appendChild(cancel);
        row.appendChild(editor);
        input.focus();
      });
      const remove = button("Remove", function () {
        if (busy) { notice("Save or cancel your note first."); return; }
        post("delete", payload());
      }, "remove");
      remove.setAttribute("aria-label", "Remove mark at " + format(mark.timestamp_seconds));
      actions.appendChild(edit);
      actions.appendChild(remove);
      top.appendChild(label);
      top.appendChild(seek);
      top.appendChild(actions);
      row.appendChild(top);
      row.appendChild(noteText);
      list.appendChild(row);
    });
  }

  byId("mark").addEventListener("click", function () {
    if (busy) { notice("Save or cancel your note first."); return; }
    post("mark");
  });
  byId("undo").addEventListener("click", function () {
    if (busy) { notice("Save or cancel your note first."); return; }
    post("undo");
  });
  byId("refresh").addEventListener("click", function () {
    if (busy) { notice("Save or cancel your note first."); return; }
    post("refresh");
  });
  byId("export").addEventListener("click", function () {
    if (busy) { notice("Save or cancel your note before exporting."); return; }
    post("export");
  });
  byId("select-json").addEventListener("click", function () {
    byId("json").focus();
    byId("json").select();
    notice("JSON selected. Press Command+C to copy.");
  });
  if (!window.iina) {
    notice("Install this plugin in IINA to connect to your video.");
    ["mark", "undo", "refresh", "export", "select-json"].forEach(function (id) { byId(id).disabled = true; });
    return;
  }
  window.iina.onMessage("state", render);
  window.iina.onMessage("notice", function (envelope) { notice(decode(envelope).message); });
  post("ready");
}());
