import numpy as np
from scipy.io import wavfile
SR = 44100
BPM = 140; B = 60 / BPM
TOTAL = 18.18
n = int(TOTAL * SR); out = np.zeros(n)
rng = np.random.default_rng(7)
def add(t, x):
    i = int(t * SR); j = min(n, i + len(x))
    if i < n: out[i:j] += x[:j - i]
def tt(sec): return np.arange(int(sec * SR)) / SR
def kick808(f=48, sec=0.9, v=1.0):
    x = tt(sec); fr = f + 120 * np.exp(-x * 30); ph = 2 * np.pi * np.cumsum(fr) / SR
    return np.tanh(2.2 * np.sin(ph) * np.exp(-x * 2.6)) * v
def clap(v=0.5):
    x = tt(0.25); nz = rng.standard_normal(len(x))
    env = np.exp(-x * 30) + 0.6 * np.exp(-np.maximum(0, x - 0.012) * 40) * (x > 0.012)
    from scipy.signal import butter, lfilter
    b, a = butter(2, [900 / (SR / 2), 5000 / (SR / 2)], 'band')
    return lfilter(b, a, nz) * env * v
def hat(v=0.12, sec=0.05):
    x = tt(sec); nz = rng.standard_normal(len(x))
    from scipy.signal import butter, lfilter
    b, a = butter(2, 7000 / (SR / 2), 'high')
    return lfilter(b, a, nz) * np.exp(-x * 90) * v
def pad(freqs, sec, v=0.05):
    x = tt(sec); s = sum(np.sin(2 * np.pi * f * x + np.sin(2 * np.pi * 0.3 * x)) for f in freqs)
    a = np.minimum(1, x / 0.4) * np.minimum(1, (sec - x) / 0.6)
    return s * a * v
def riser(sec=1.2, v=0.25):
    x = tt(sec); nz = rng.standard_normal(len(x))
    from scipy.signal import butter, lfilter
    b, a = butter(2, 3000 / (SR / 2), 'high')
    return lfilter(b, a, nz) * (x / sec) ** 2 * v
HOOK, PER, N = 8, 4, 6; END = HOOK + PER * N
beats = int(TOTAL / B)
# dark minor pad (Am - F - C - G feel, low)
chords = [[110, 130.8, 164.8], [87.3, 110, 130.8], [98, 123.5, 146.8], [82.4, 98, 123.5]]
for k in range(0, beats, 8):
    add(k * B, pad(chords[(k // 8) % 4], 8 * B))
for k in range(beats):
    t = k * B
    if k >= 2:
        # hats: 8ths with 16th/32nd rolls at the end of every 4 bars
        sub = 4 if (k % 16) >= 14 else 2
        for s in range(sub):
            add(t + s * B / sub, hat(0.10 if s % 2 else 0.14))
    if k >= HOOK and k % 2 == 1: add(t, clap(0.45))
    if k >= HOOK and k < END + 5 and (k - HOOK) % 4 in (0, 3): add(t + (B / 2 if (k - HOOK) % 4 == 3 else 0), kick808(v=0.55))
# hook word hits
for k in (0.7, 1.4, 2.1): add(k * B, kick808(44, 0.7, 0.9)); add(k * B, clap(0.5))
add((HOOK - 2) * B, riser(2 * B))
# a heavy 808 + clap on every stamp, a riser into each new card
for i in range(N):
    st = (HOOK + PER * i + 1) * B
    add(st, kick808(41, 1.1, 1.0)); add(st, clap(0.7))
    if i < N - 1: add((HOOK + PER * (i + 1) - 1.5) * B, riser(1.5 * B, 0.18))
# end: big hit, then a long 808
add(END * B, kick808(36, 1.8, 1.0)); add(END * B, clap(0.7))
add((END + 2) * B, kick808(41, 1.2, 0.7))
add((END + 3.5) * B, riser(1.5 * B, 0.22))
add((END + 5) * B, kick808(36, 1.8, 1.0)); add((END + 5) * B, clap(0.7))
add((END + 7) * B, kick808(41, 1.2, 0.7))
fade = np.minimum(1, (TOTAL - np.arange(n) / SR) / 1.2)
out *= np.clip(fade, 0, 1)
out = np.tanh(out * 1.2); out /= np.max(np.abs(out)) / 0.89
wavfile.write('jcbeat.wav', SR, (np.stack([out, out], 1) * 32767).astype(np.int16))
print('ok', TOTAL)
