# Highlight Marks for IINA

A minimal-permission bookmarking plugin for [IINA](https://iina.io/). Save moments
with a keyboard shortcut, add notes, jump back to them, and export timestamps as JSON.

Useful for reviewing footage, taking study notes, preparing transcripts, or sharing
points of interest with editing tools. Each bookmark records a single source
timestamp. No clip boundaries are inferred.

## Why fewer permissions?

Highlight Marks is designed to be a safer choice for simple timestamp bookmarking
by requesting the minimum permission needed for its features: **Show OSD**, which
displays brief confirmations. It does not request broad filesystem access,
network access, or video overlays.

Compared with [IINA Plugin Bookmarks](https://github.com/wyattowalsh/iina-plugin-bookmarks),
Highlight Marks has a smaller declared permission footprint:

| Declared permission | Highlight Marks | IINA Plugin Bookmarks 1.1.0 |
| --- | --- | --- |
| Show OSD | Yes | Yes |
| Broad filesystem access | No | Yes |
| Network requests | No | Yes |
| Video overlays | No | Yes |

The comparison is based on the plugins' manifests: [Highlight Marks](plugin/Info.json)
and [IINA Plugin Bookmarks 1.1.0](https://github.com/wyattowalsh/iina-plugin-bookmarks/blob/v1.1.0/Info.json).
The other plugin offers a broader feature set. Fewer requested permissions reduce
unnecessary access; they are not proof that another plugin is unsafe or a guarantee
about IINA's permission enforcement. [SECURITY.md](SECURITY.md) documents the scope.

Highlight Marks has no runtime dependencies, network code, shell commands, remote
assets, or automatic update source. Its complete installed source is five readable
files. Updates require installing a newly reviewed package manually.

## Install

1. Download [highlight-marks.iinaplgz](dist/highlight-marks.iinaplgz) using GitHub's
   **Download raw file** button, or build the package from source.
2. Double-click the package and complete installation in IINA.
3. Confirm that the permission list contains **Show OSD only**.
4. Enable **Highlight Marks** in **IINA → Settings (or Preferences) → Plugins**,
   then reopen the video. Restart IINA if the plugin menu is not visible.

If another plugin uses Control+B, disable that shortcut or plugin to avoid a conflict.

The implementation targets IINA 1.4.4 APIs. Automated tests simulate those APIs;
full installation and playback verification in IINA has not yet been completed.

## Use

| Action | Shortcut / plugin menu item |
| --- | --- |
| Save the current point without pausing | **Control+B** / Mark Current Moment |
| Undo the last addition, removal, or note edit | **Control+Shift+B** / Undo Last Change |
| Review, jump to, remove, or annotate marks | **Control+Shift+M** / Review Marks… |
| Export the current video's marks and reveal the JSON in Finder | **Control+Shift+E** / Export This Video’s Marks… |

Use shortcuts with the video player window focused. Menu actions are available in
IINA's Plugin menu under Highlight Marks. Undo covers the most recent change in
that player session. The review window shows the current video; reopen another
video to view its saved marks. Notes are optional and saved with **Save note**.

Timestamps use source playback seconds, independent of playback speed. Exact
values are preserved; displayed timecodes are rounded to milliseconds. Distinct
nearby marks remain separate. Repeated presses at the same paused instant are
deduplicated.

## JSON export

Export creates a new JSON file containing only the current video's marks and
selects it in Finder. Copy it to a preferred location or pass it to another tool.
The review window also contains the JSON in a selectable text area.

```json
{
  "format": "highlight-marks",
  "version": 1,
  "timestamp_semantics": "point_of_interest",
  "source": {
    "path": "/Movies/example.mp4",
    "title": "Example",
    "duration_seconds": 180
  },
  "marks": [
    {
      "id": "example-mark",
      "timestamp_seconds": 12.345,
      "timecode": "00:00:12.345",
      "note": "A point worth revisiting",
      "created_at": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

Exports contain filenames, absolute source paths, and notes. Review those fields
before sharing an export. A point timestamp is an anchor for reviewing nearby
footage, not an instruction to cut exactly at that instant. No editing preferences
or target durations are imposed.

Files are identified by absolute path. Moving a file creates a new entry; the
plugin does not inspect video contents or calculate content hashes.

## Storage and recovery

IINA stores data inside the plugin's private directory:

```text
~/Library/Application Support/com.colliderli.iina/plugins/.data/org.highlightmarks.iina/
```

- `marks.json`: all saved videos and marks, written atomically after each change.
- `marks.backup.json`: the database before the last successful change.
- `VIDEO-marks-TIMESTAMP.json`: a new export of one video's marks.

**Show Saved Data in Finder** reveals the most recent export in the current
session, or `marks.json`. The plugin does not modify videos or write beside them.
If the database becomes unreadable, mutations stop instead of resetting it.
With IINA closed, preserve the unreadable file and restore `marks.backup.json` as
`marks.json` if appropriate. Back up this directory before reinstalling or uninstalling.

## Develop

No package manager or downloads are required. Tests use Node.js's built-in test
runner; packaging uses Python 3's standard library.

```sh
node --test tests/plugin.test.cjs
python3 build.py
```

The build produces a reproducible ZIP with IINA's `.iinaplgz` extension.
`dist/CONTENTS.sha256` lists the packaged source hashes; `dist/SHA256SUMS` records
the package hash. Rebuild after changing files in `plugin/`.

The implementation is original. It does not include code or dependencies from
IINA Plugin Bookmarks. Contributions should keep the source readable, avoid adding
unnecessary permissions, and include relevant tests for behavior changes.

## License

[MIT](LICENSE).
