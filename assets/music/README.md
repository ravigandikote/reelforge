# Music library

Background tracks come from NeeRav's own licensed library. Drop `.mp3` or `.wav`
files into this folder and describe them in `manifest.json`; `pnpm db:seed` reads
that file and makes the tracks selectable in the UI. Audio files are gitignored —
only the manifest is committed.

```json
{
  "tracks": [
    {
      "file": "morning-raga.mp3",
      "title": "Morning Raga",
      "durationSec": 184,
      "bpm": 72,
      "mood": "calm, acoustic",
      "license": "Licensed from <source>, invoice #1234, perpetual social use"
    }
  ]
}
```

`license` is free text and is stored with the track so an output can always be
traced back to its clearance.
