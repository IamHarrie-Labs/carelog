# CareLog film

A 1 minute 42 second motion-design film for CareLog: 1080p, 60 fps, with a female voiceover, kinetic typography, a synthesised score and sound design.

**Watch:** [`carelog-film.mp4`](carelog-film.mp4)

## The story

| Time | Scene | What happens |
|---|---|---|
| 0:00 | Hook | A clock spins to 2:00. *"Did Dad have his tablets?"* The camera dives through the question mark. |
| 0:05 | The group chat | Three siblings and Dad. Chat messages flood in: a dose given twice, a note about dizziness scrolls away, "someone should book Thursday's transport" is said once and the word *forgotten* falls apart. |
| 0:21 | Turn | *Care changes hands* passes across the screen; scattered letters assemble into *can stay together*. |
| 0:25 | Logo | A forest circle opens, the CareLog leaves draw themselves, the wordmark rises. |
| 0:27 | One shared record | Every entry carries a name and a time; the name and time chips pulse as they are spoken. |
| 0:33 | Recorded once | Sam records the dose; Alex tries again and the card shakes: *Already recorded by Sam at 2:04 PM.* |
| 0:39 | Honest | The clock passes 6:00; CareLog shows *no administration recorded*. A MISSED stamp slams down, is struck through and falls away. *Just honest.* |
| 0:44 | Corrections | 1:45 PM is struck through, 12:45 PM drops in; the original, the author and the reason are highlighted in turn. *All kept.* |
| 0:51 | Quick log | A sentence is typed in sync with the voice; its words light up and fly into a structured record. |
| 0:58 | Handoff | Sam to Alex. The handoff builds: recorded, no record, open items. Alex acknowledges. |
| 1:08 | Open items | *Book Thursday transport* lifts out of the handoff and stays put while the days stream past, until Jo records the outcome. |
| 1:15 | The circle | Members orbit Dad. Tom is removed and flies out of the circle. *Instantly.* |
| 1:21 | Montage | Emergency packets, money split to the cent, appointments, supplies, care load. |
| 1:28 | Close | *It won't tell you what to give. It remembers what was given, and by whom. Care is shared. The details should be, too.* Logo and "Create a care circle". |

The copy follows the product's own rules: nothing claims clinical safety, a missing record is never called "missed", and acknowledging a handoff never closes an open item.

## How it is made

Everything is generated from code in this folder, using the repository's own fonts (EB Garamond, Figtree, DM Sans) and the brand palette from `brand.md`.

| File | Role |
|---|---|
| `script.json` | The voiceover script, line by line, with the pause after each line. |
| `voiceover.py` | Synthesises each line with the [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) neural voice `af_heart` and writes `timeline.json` / `timeline.js` with the exact start and end of every line. |
| `composition.html` / `.css` / `.js` | The animation. `render(t)` is a pure function of time, and every animation is keyed to the voice timeline, so the words on screen land on the spoken words. |
| `render.mjs` | Seeks the composition frame by frame in headless Chromium (four parallel workers) and pipes the frames to ffmpeg. Also exports stills and the sound-effect cue list. |
| `soundtrack.py` | Synthesises the score (tense D minor pulse, warm piano, a 96 BPM groove, a resolving finale) and about 150 sound effects at the cue times the composition exports, then mixes them under the voice with ducking. |

### Rebuild

```bash
pip install kokoro-onnx soundfile scipy
# model files: kokoro-v1.0.onnx and voices-v1.0.bin from
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
npm install                                   # Playwright, from the repository root
cd video
python3 voiceover.py /path/to/kokoro-models   # build/voice.wav, timeline.json, timeline.js
node render.mjs --cues                        # build/cues.json
python3 soundtrack.py                         # build/soundtrack.wav
node render.mjs --fps 60 --workers 4          # build/video.mp4
ffmpeg -i build/video.mp4 -i build/soundtrack.wav -c:v copy -c:a aac -b:a 256k -shortest carelog-film.mp4
```

`node render.mjs --stills 12.5,40` writes single frames to `build/stills` for checking a moment. To preview in a browser with sound, serve this folder over HTTP after building the soundtrack, open `composition.html?play`, and click.

Set `CHROMIUM_PATH` if Chromium is not at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
