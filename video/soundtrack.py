"""Synthesise the score and sound effects, then mix them under the voiceover.

Reads timeline.json (voice timings), build/cues.json (sound effect cues exported
from the composition) and build/voice.wav. Writes build/soundtrack.wav.
Everything is generated here from oscillators and noise: no samples.
"""
import json
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

here = Path(__file__).parent
SR = 48000
TL = json.loads((here / "timeline.json").read_text())
CUES = json.loads((here / "build" / "cues.json").read_text())["cues"]
DUR = TL["duration"]
N = int(DUR * SR) + SR
rng = np.random.default_rng(11)
S = lambda k: TL["lines"][k]["start"]


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(d):
    return np.arange(int(d * SR)) / SR


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def adsr(n, a=0.01, r=0.1):
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, t, sig, gain=1.0, pan=0.0):
        if sig.ndim == 1:
            sig = np.stack([sig * np.sqrt(0.5 * (1 - pan)), sig * np.sqrt(0.5 * (1 + pan))], 1) * np.sqrt(2)
        i = int(t * SR)
        if i >= N or i + len(sig) <= 0: return
        j0 = max(0, -i); i = max(0, i)
        seg = sig[j0:j0 + N - i]
        self.x[i:i + len(seg)] += seg * gain


# ---------------- instruments ----------------
def piano(f, d=3.0, vel=1.0, bright=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    for k in range(1, 10):
        fk = f * k * (1 + 0.0004 * k * k)
        if fk > 16000: break
        s += (1 / k ** 1.4) * np.exp(-t * (0.9 + k * 0.7 / bright)) * np.sin(2 * np.pi * fk * t + k)
    s *= adsr(len(t), 0.004, 0.25)
    hammer = lp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 60) * 0.05
    return (s + hammer) * vel * 0.35


def pluck(f, d=0.6, vel=1.0):
    t = tt(d)
    s = sum((1 / k ** 1.7) * np.exp(-t * (6 + 4 * k)) * np.sin(2 * np.pi * f * k * t) for k in range(1, 7))
    return s * adsr(len(t), 0.002, 0.05) * vel * 0.4


def pad(freqs, d, vel=1.0, cutoff=1800, a=1.2, r=1.5):
    t = tt(d)
    left, right = np.zeros_like(t), np.zeros_like(t)
    for f in freqs:
        for det, side in ((-0.11, 0), (0.0, 2), (0.12, 1)):
            ff = f * 2 ** (det / 12)
            ph = rng.uniform(0, 6.28)
            w = sum((1 / k) * np.sin(2 * np.pi * ff * k * t + ph * k) for k in range(1, 9) if ff * k < 9000)
            if side in (0, 2): left += w
            if side in (1, 2): right += w
    st = np.stack([left, right], 1)
    st = np.stack([lp(st[:, 0], cutoff), lp(st[:, 1], cutoff)], 1)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 0.23 * t)
    e = adsr(len(t), a, r) * trem
    return st * e[:, None] * vel * 0.05 / max(1, len(freqs)) ** 0.5


def bass(f, d, vel=1.0):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    return s * adsr(len(t), 0.01, 0.12) * np.exp(-t * 0.6) * vel * 0.32


def kick(vel=1.0):
    t = tt(0.5)
    f = 45 + 75 * np.exp(-t * 30)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    s += lp(rng.standard_normal(len(t)), 4000) * np.exp(-t * 200) * 0.15
    return s * vel * 0.65


def hat(vel=1.0, d=0.05):
    t = tt(0.12)
    return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t / d * 3) * vel * 0.08


def clap(vel=1.0):
    t = tt(0.3)
    n = bp(rng.standard_normal(len(t)), 900, 5000)
    e = np.exp(-t * 18) + 0.6 * np.exp(-np.maximum(t - 0.012, 0) * 40) * (t > 0.012)
    return n * e * vel * 0.18


def noise_sweep(d, f0, f1, peak=0.6, q=0.5):
    """Band-passed noise whose centre glides from f0 to f1 (block-wise)."""
    n = int(d * SR)
    out = np.zeros(n)
    src = rng.standard_normal(n + 4096)
    blk = 1024
    for i in range(0, n, blk):
        p = i / n
        fc = f0 * (f1 / f0) ** p
        lo, hi = max(40, fc * (1 - q)), min(20000, fc * (1 + q))
        seg = bp(src[i:i + 2048 + blk], lo, hi)[2048:]  # 2048-sample warm-up keeps blocks seamless
        out[i:i + len(seg)] = seg[: n - i]
    t = np.arange(n) / n
    env = np.where(t < peak, (t / peak) ** 2, ((1 - t) / (1 - peak)) ** 1.5)
    return out * env


def bell(f, d=3.0):
    t = tt(d)
    s = np.zeros_like(t)
    for ratio, amp, dec in ((1, 1, 1.2), (2.76, 0.5, 2.2), (5.4, 0.25, 3.5), (8.93, 0.12, 5)):
        s += amp * np.exp(-t * dec) * np.sin(2 * np.pi * f * ratio * t)
    return s * adsr(len(t), 0.002, 0.3) * 0.18


# ---------------- sound effects ----------------
def sfx(kind):
    t1 = lambda d: tt(d)
    if kind == "tick":
        t = t1(0.06)
        return (rng.standard_normal(len(t)) * np.exp(-t * 900) * 0.5 + np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 90) * 0.35) * 0.5
    if kind == "tick2":
        t = t1(0.18)
        return (np.sin(2 * np.pi * 1480 * t) + 0.5 * np.sin(2 * np.pi * 2220 * t)) * np.exp(-t * 28) * 0.16
    if kind == "pop":
        t = t1(0.12)
        f = 520 + 700 * (1 - np.exp(-t * 40))
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 38) * 0.28
    if kind == "key":
        t = t1(0.04)
        return bp(rng.standard_normal(len(t)), 1500 + rng.uniform(0, 1500), 6000) * np.exp(-t * 220) * 0.45
    if kind == "click":
        t = t1(0.05)
        n = hp(rng.standard_normal(len(t)), 2000)
        return (n * np.exp(-t * 400) + 0.5 * np.sin(2 * np.pi * 900 * t) * np.exp(-t * 120)) * 0.35
    if kind == "whoosh":
        return lp(noise_sweep(0.75, 300, 4500, 0.55), 9000) * 0.55
    if kind == "swoosh":
        return noise_sweep(0.4, 600, 6000, 0.5) * 0.4
    if kind == "wipe":
        return noise_sweep(0.8, 2000, 400, 0.4) * 0.55
    if kind == "riser":
        d = 0.8
        t = t1(d)
        s = noise_sweep(d, 300, 9000, 0.97, 0.35) * 0.4
        s += np.sin(2 * np.pi * np.cumsum(200 * 2 ** (3 * t / d)) / SR) * (t / d) ** 2 * 0.12
        return s
    if kind == "reveal":
        s = noise_sweep(1.0, 200, 3000, 0.6) * 0.5
        return s
    if kind == "boom":
        t = t1(2.5)
        f = 38 + 30 * np.exp(-t * 8)
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6) + lp(rng.standard_normal(len(t)), 200) * np.exp(-t * 3) * 0.4) * 0.6
    if kind == "chime":
        return bell(1318.5, 3.5) + 0.7 * np.pad(bell(1975.5, 3.2), (int(0.11 * SR), int(0.19 * SR)))[: int(3.5 * SR)]
    if kind == "success":
        a = bell(1318.5, 1.4)
        b = np.pad(bell(1760, 1.6), (int(0.1 * SR), 0))
        return np.pad(a, (0, len(b) - len(a))) + b
    if kind == "error":
        t = t1(0.32)
        sq = np.sign(np.sin(2 * np.pi * 170 * t)) * ((t < 0.1) | ((t > 0.15) & (t < 0.27)))
        return lp(sq, 1600) * 0.16
    if kind == "thud":
        t = t1(0.35)
        return (np.sin(2 * np.pi * (70 + 60 * np.exp(-t * 30)) * t) * np.exp(-t * 14) + lp(rng.standard_normal(len(t)), 900) * np.exp(-t * 40) * 0.3) * 0.6
    if kind == "stamp":
        t = t1(0.5)
        body = np.sin(2 * np.pi * (60 + 80 * np.exp(-t * 40)) * t) * np.exp(-t * 10)
        crack = bp(rng.standard_normal(len(t)), 500, 6000) * np.exp(-t * 60)
        return (body * 0.8 + crack * 0.45) * 0.7
    if kind == "scratch":
        t = t1(0.32)
        return bp(rng.standard_normal(len(t)), 1800, 7000) * np.sin(np.pi * t / 0.32) ** 2 * 0.18
    if kind == "shimmer":
        out = np.zeros(int(1.6 * SR))
        for i in range(14):
            b = bell(rng.choice([1760, 2093, 2349, 2637, 3136, 3520]), 1.0) * 0.35
            k = int(rng.uniform(0, 0.9) * SR)
            out[k:k + len(b)] += b[: len(out) - k]
        return out
    if kind == "snap":
        t = t1(0.3)
        return (hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 120) * 0.6 + np.sin(2 * np.pi * 110 * t) * np.exp(-t * 20) * 0.4) * 0.55
    if kind == "impact":
        b = sfx("boom") * 1.2
        s = sfx("stamp")
        s = np.pad(s, (0, len(b) - len(s)))
        return b + s * 0.8
    raise ValueError(kind)


# ---------------- score ----------------
music = Bus()
D = 62  # D4

def chord(root, kind):
    iv = {"maj": [0, 4, 7], "min": [0, 3, 7], "maj7": [0, 4, 7, 11], "min7": [0, 3, 7, 10], "add9": [0, 4, 7, 14], "sus": [0, 5, 7]}[kind]
    return [root + i for i in iv]

# A. Hook: low drone and a heartbeat under the clock
music.add(0.0, pad([mtof(38), mtof(45), mtof(50)], 5.6, 1.2, cutoff=500, a=2.0, r=0.6), 1.0)
music.add(0.0, np.stack([lp(rng.standard_normal(int(5.6 * SR)), 300)] * 2, 1) * adsr(int(5.6 * SR), 2.5, 0.8)[:, None] * 0.05)
for b in (1.1, 2.1, 3.1, 4.1):
    music.add(b, kick(0.45), 1); music.add(b + 0.22, kick(0.25), 1)

# B. Group chat: tense D minor ostinato, growing denser
t0, beat = 5.45, 0.5
prog_b = [(50, "min"), (46, "maj"), (43, "min"), (45, "maj")]
for bar in range(8):
    tb = t0 + bar * 2.0
    if tb >= 20.4: break
    root, kind = prog_b[bar % 4]
    music.add(tb, pad([mtof(n) for n in chord(root + 12, kind)], 2.1, 0.9, cutoff=1200, a=0.4, r=0.4))
    music.add(tb, bass(mtof(root - 12 + 12), 1.9, 0.8))
    notes = chord(root + 24, kind)
    for i in range(16):
        tn = tb + i * 0.125
        if tn >= 20.38: break
        lvl = 0.35 + 0.65 * (tn - t0) / 15
        music.add(tn, pluck(mtof(notes[[0, 1, 2, 1][i % 4]] + (12 if i % 8 >= 6 else 0)), 0.3, lvl), 0.9, pan=0.3 * np.sin(i))
    for i in range(4):
        tk = tb + i * 0.5
        if 10.8 <= tk < 20.3: music.add(tk, kick(0.6))
    for i in range(16):
        th = tb + i * 0.125
        if 12.6 <= th < 20.3: music.add(th, hat(0.5 + 0.5 * (i % 2 == 0)), 1, pan=0.4)
music.add(18.4, noise_sweep(2.0, 200, 9000, 0.98, 0.3) * 0.35, 1)

# C. Care changes hands: warm piano
def roll(t, notes, vel=0.9, gap=0.045, d=4.0):
    for i, n in enumerate(notes):
        music.add(t + i * gap, piano(mtof(n), d, vel), 1, pan=-0.3 + 0.6 * i / max(1, len(notes) - 1))

roll(S("t1") - 0.05, [43, 59, 62, 66, 71], 0.9)
roll(S("t2") - 0.05, [42, 57, 62, 66, 69, 74], 0.7)
music.add(S("t1") - 0.1, pad([mtof(n) for n in (55, 59, 62, 66)], 3.4, 0.8, cutoff=1400, a=1.0, r=1.0))
music.add(S("t2") - 0.1, pad([mtof(n) for n in (54, 57, 62, 66)], 2.6, 0.9, cutoff=1500, a=0.8, r=1.2))

# D. Logo swell
music.add(25.3, pad([mtof(n) for n in (38, 50, 57, 62, 66, 69, 76)], 3.6, 1.6, cutoff=2600, a=0.6, r=1.6))
roll(25.95, [50, 57, 62, 66, 69, 76], 0.8, 0.06, 4.0)

# E/F. Groove from the first feature to the end of the montage
bpm = 96
bt = 60 / bpm
g0 = 27.55
prog = [(50, "add9"), (47, "min7"), (43, "maj7"), (45, "sus")]
bar_len = 4 * bt
nbar = int((87.9 - g0) / bar_len) + 1
for bar in range(nbar):
    tb = g0 + bar * bar_len
    root, kind = prog[bar % 4]
    end = 87.9
    if tb >= end: break
    montage = tb >= 80.9
    music.add(tb, pad([mtof(n) for n in chord(root + 12, kind)], bar_len + 0.6, 1.0, cutoff=2200 if not montage else 3200, a=0.3, r=0.6), 1)
    if tb >= 38.9: music.add(tb, bass(mtof(root - 12 + 12 - 12 + 12), bar_len * 0.95, 0.9)); music.add(tb + 2 * bt, bass(mtof(root), bar_len * 0.45, 0.6))
    arp = chord(root + 24, kind) + [root + 36]
    pattern = [0, 2, 1, 3, 2, 4, 3, 1]
    for i in range(8 if not montage else 16):
        step = bt / 2 if not montage else bt / 4
        tn = tb + i * step
        if tn >= end - 0.02: break
        n = arp[pattern[i % 8] % len(arp)]
        music.add(tn, pluck(mtof(n), 0.5, 0.55 if not montage else 0.5), 1, pan=0.5 * np.sin(i * 1.3))
    for i in range(4):
        tk = tb + i * bt
        if tk >= end - 0.02: break
        kick_on = (33.3 <= tk) and not (68.25 <= tk < 70.6)
        if kick_on and (i % 2 == 0 or montage): music.add(tk, kick(0.75))
        if (tk >= 57.5 and i % 2 == 1 and not (68.25 <= tk < 70.6)) or (montage and i % 2 == 1): music.add(tk, clap(0.9))
    for i in range(8 if not montage else 16):
        th = tb + i * (bt / 2 if not montage else bt / 4)
        if th >= end - 0.02: break
        if th >= 30.0: music.add(th, hat(0.55 if i % 2 else 0.9, 0.04), 1, pan=-0.35)
    if bar % 2 == 0 and tb < 80:
        music.add(tb + bt * 0.02, piano(mtof(chord(root + 24, kind)[-1] + 12), 2.4, 0.35), 1, pan=0.4)
music.add(86.6, noise_sweep(1.3, 300, 10000, 0.98, 0.3) * 0.4, 1)

# G. Quiet reflection
music.add(87.95, pad([mtof(n) for n in (47, 54, 59, 62, 66)], 2.6, 0.9, cutoff=1300, a=0.4, r=1.2))
music.add(90.1, pad([mtof(n) for n in (43, 55, 59, 62, 66)], 3.0, 0.9, cutoff=1300, a=0.6, r=1.4))
for tn, n in ((88.3, 71), (89.0, 74), (89.6, 69), (90.1, 71), (90.8, 74), (91.5, 78), (92.1, 76)):
    music.add(tn, piano(mtof(n), 2.5, 0.45), 1, pan=0.2)

# H. Resolve
roll(S("e3") - 0.05, [38, 50, 57, 62, 66, 69], 0.8, 0.05, 5.0)
music.add(92.6, pad([mtof(n) for n in (50, 57, 62, 66, 69)], 4.4, 1.1, cutoff=2400, a=0.9, r=1.2))
fin = S("e5") - 0.05
music.add(fin, pad([mtof(n) for n in (38, 50, 57, 62, 64, 66, 69, 76)], DUR - fin + 0.5, 1.1, cutoff=2600, a=0.3, r=3.0))
roll(fin, [38, 50, 57, 64, 66, 69, 74, 78], 0.7, 0.07, 6.0)

# Reverb on the music bus
def reverb(x, secs=2.6, mix=0.28):
    n = int(secs * SR)
    t = np.arange(n) / SR
    ir = np.stack([lp(rng.standard_normal(n), 6000) * np.exp(-t * 3.2) for _ in range(2)], 1)
    ir[: int(0.02 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum(0))
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    return x * (1 - mix) + wet * mix * 1.6

music.x = reverb(music.x)

# ---------------- effects bus ----------------
fx = Bus()
for c in CUES:
    s = sfx(c["type"])
    fx.add(c["t"], s, c["gain"] * 0.9, pan=rng.uniform(-0.25, 0.25))
fx.x = reverb(fx.x, 1.4, 0.18)

# ---------------- voice and mix ----------------
v, vsr = sf.read(here / "build" / "voice.wav")
v = resample_poly(v, SR, vsr)
v = hp(v, 80)
v = v / np.max(np.abs(v)) * 0.9
voice = np.zeros(N); voice[: len(v)] = v[:N]
# Gentle compression for an even, close voice
env = np.sqrt(np.maximum(lp(voice ** 2, 20), 0))
gain = np.where(env > 0.12, (0.12 / np.maximum(env, 1e-9)) ** 0.35, 1.0)
voice = voice * gain
voice = voice / np.max(np.abs(voice)) * 0.85
vroom = np.stack([voice, voice], 1)
vroom = reverb(vroom, 0.9, 0.07)

# Duck music under the voice
venv = lp((lp(np.abs(voice), 8) > 0.01).astype(float), 1.8)
venv = np.clip(venv * 1.6, 0, 1)
duck = 1 - 0.68 * venv

m = music.x / (np.percentile(np.abs(music.x), 99.5) + 1e-9) * 0.26
f = fx.x / (np.max(np.abs(fx.x)) + 1e-9) * 0.42
mix = m * duck[:, None] + f + vroom * 1.25
mix = mix[: int(DUR * SR)]
fade = int(0.8 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix = mix / np.max(np.abs(mix)) * 0.95
L_ = int(DUR * SR)
for name, stem in (("music", m * duck[:, None]), ("fx", f), ("voice", vroom * 1.25)):
    sf.write(here / "build" / f"stem-{name}.wav", stem[:L_].astype(np.float32), SR)
sf.write(here / "build" / "soundtrack.wav", mix.astype(np.float32), SR, subtype="PCM_24")
print(f"soundtrack {len(mix) / SR:.2f}s")
