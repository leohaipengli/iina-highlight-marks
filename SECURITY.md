# Source and permission review

This plugin uses manually installed packages, without a remote update source.
The manifest has **only `show-osd`**. It omits `file-system`, `network-request`,
`video-overlay`, `ghRepo`, `ghVersion`, remote help pages, and author web links.
There is no package manager, bundled binary, minified bundle, external script,
remote font, analytics code, network request, process launch, or dynamic code evaluation.

## Every IINA API this plugin calls

| API | Purpose / limit |
| --- | --- |
| `core.status.url`, `title`, `duration`, `idle`, `isNetworkResource` | Metadata for the video already open in this player; reject nonlocal media. IINA 1.4.4 already percent-decodes `url`. |
| `mpv.getNative("time-pos")` | Read only the current source playback time; unavailable time is rejected, never replaced with zero. |
| `core.seekTo` | Jump to the selected saved mark in the current video. |
| `core.osd` | Brief saved/error confirmations; the single requested permission. |
| `file.exists`, `read`, `write` | Only `@data/marks.json`, its backup, and generated export names under `@data/`. No user-supplied destination is accepted. |
| `file.showInFinder` | Reveal those same private files. |
| `menu.item`, `addItem`, `separator` | Local menu actions and shortcuts. |
| `standaloneWindow.loadFile`, `open`, `setProperty`, `setFrame`, `onMessage`, `postMessage` | Packaged local review page and a small set of validated actions. No remote pages. |
| `event.on` | Refresh the review page after local playback file events. |

IINA 1.4.4's `parsePath` allows `@data/` paths inside this plugin's private directory
without the broad filesystem permission. `file.write` writes atomically. Host
source references: [path handling](https://github.com/iina/iina/blob/v1.4.4/iina/JavascriptAPI.swift),
[file operations](https://github.com/iina/iina/blob/v1.4.4/iina/JavascriptAPIFile.swift),
[playback metadata](https://github.com/iina/iina/blob/v1.4.4/iina/JavascriptAPICore.swift),
[update checks](https://github.com/iina/iina/blob/v1.4.4/iina/JavascriptPlugin.swift).

## Data handling

- The database is read fresh before every mutation, preserving other player
  windows' changes. Mutations are synchronous with no asynchronous work between
  reading and writing. Undo refuses to overwrite a conflicting edit.
- A malformed database is left untouched. Each write first saves the previous
  database as a backup. Exports use fresh names instead of overwriting earlier exports.
- The UI renders names and notes with `textContent` / textarea `value`, never HTML.
- IINA's old message bridge interpolates outgoing JSON into template literals.
  All outgoing data is URI-encoded inside a fixed envelope, so literal backticks
  and `${...}` in filenames and notes cannot become JavaScript in that bridge.
- The page's Content Security Policy blocks network connections and remote assets.
  The UI does not load arbitrary URLs or execute data as code.
- Every saved mark is a source timestamp, never an inferred interval. The source
  path and notes are present in the JSON you deliberately export.

## Scope of these claims

This describes the included source, not an independent security certification or
a guarantee about IINA's own permission enforcement. Plugins run inside IINA;
IINA itself has access to the videos you open. A local copy can still be altered by
someone who can modify your files. Retain the source and hashes, and review future
changes before installing them. No part of this plugin fetches its own updates.
