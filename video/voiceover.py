"""Synthesise the voiceover phrase by phrase and write timeline.json.

Each phrase is generated on its own so the composition knows exactly when
every line starts and ends. Usage: python3 voiceover.py <kokoro-model-dir>
"""
import json, sys
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

here = Path(__file__).parent
model_dir = Path(sys.argv[1])
script = json.loads((here / "script.json").read_text())
kokoro = Kokoro(str(model_dir / "kokoro-v1.0.onnx"), str(model_dir / "voices-v1.0.bin"))

SR = 24000
out, t, timeline = [np.zeros(int(script["lead_in"] * SR), np.float32)], script["lead_in"], {}
for key, text, gap in script["lines"]:
    samples, sr = kokoro.create(text, voice=script["voice"], speed=script["speed"], lang="en-us")
    assert sr == SR
    # Kokoro pads each clip with a little silence; trim it so timings are tight.
    loud = np.flatnonzero(np.abs(samples) > 0.01)
    samples = samples[max(loud[0] - 600, 0): loud[-1] + 1800]
    dur = len(samples) / SR
    timeline[key] = {"start": round(t, 3), "end": round(t + dur, 3), "text": text}
    out += [samples, np.zeros(int(gap * SR), np.float32)]
    t += dur + gap
out.append(np.zeros(int(script["tail"] * SR), np.float32))
total = t + script["tail"]
voice = np.concatenate(out)
sf.write(here / "build" / "voice.wav", voice, SR)
data = json.dumps({"duration": round(total, 3), "lines": timeline}, indent=1)
(here / "timeline.json").write_text(data)
(here / "timeline.js").write_text(f"window.TIMELINE = {data};\n")
print(f"duration {total:.2f}s")
