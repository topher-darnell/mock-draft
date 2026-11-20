# A 122.4 BPM beat on the same grid as the TikTok sound "Sweet As Honey", for YouTube and X
# (on TikTok/Instagram, add the real sound in the app and turn this down).
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter
SR = 44100
BPM = 122.4; B = 60 / BPM; OFF = 0.25          # first beat of the sound
HOOK, PER, N = 6, 4, 6; END = HOOK + PER * N   # in beats after OFF
TOTAL = 19.97
n = int(TOTAL * SR); out = np.zeros(n); rng = np.random.default_rng(3)
T = lambda k: OFF + k * B
def add(t, x):
    i = int(max(0, t) * SR); j = min(n, i + len(x))
    if i < n: out[i:j] += x[:j - i]
def tt(sec): return np.arange(int(sec * SR)) / SR
def kick(f=50, sec=0.8, v=1.0):
    x = tt(sec); fr = f + 110 * np.exp(-x * 28); ph = 2 * np.pi * np.cumsum(fr) / SR
    return np.tanh(2 * np.sin(ph) * np.exp(-x * 3)) * v
def clap(v=0.5):
    x = tt(0.25); b, a = butter(2, [900 / (SR / 2), 5000 / (SR / 2)], 'band')
    env = np.exp(-x * 30) + 0.6 * np.exp(-np.maximum(0, x - 0.012) * 40) * (x > 0.012)
    return lfilter(b, a, rng.standard_normal(len(x))) * env * v
def hat(v=0.1):
    x = tt(0.05); b, a = butter(2, 7000 / (SR / 2), 'high')
    return lfilter(b, a, rng.standard_normal(len(x))) * np.exp(-x * 90) * v
def pad(freqs, sec, v=0.05):
    x = tt(sec); s = sum(np.sin(2 * np.pi * f * x) for f in freqs)
    return s * np.minimum(1, x / 0.3) * np.minimum(1, (sec - x) / 0.5) * v
def riser(sec, v=0.2):
    x = tt(sec); b, a = butter(2, 3000 / (SR / 2), 'high')
    return lfilter(b, a, rng.standard_normal(len(x))) * (x / sec) ** 2 * v
beats = int((TOTAL - OFF) / B)
chords = [[130.8, 164.8, 196], [110, 130.8, 164.8], [87.3, 110, 130.8], [98, 123.5, 146.8]]   # warm major-ish loop
for k in range(-2, beats, 4): add(T(k + 2), pad(chords[((k + 2) // 4) % 4], 4 * B))      # chords change on the bar hits
for k in range(beats):
    for s in range(2): add(T(k) + s * B / 2, hat(0.09 if s else 0.12))
    if k % 2 == 1: add(T(k), clap(0.25))
    if k % 4 == 2: add(T(k), kick(v=1.0)); add(T(k), clap(0.7))                       # the bar hit (1.23s, 3.19s, ...)
    elif k % 4 == 0 and k >= HOOK: add(T(k), kick(v=0.45))
for i in range(4): add(T(i), kick(46, 0.6, 0.7))                 # hook words
for i in range(N):
    add(T(HOOK + PER * i + 1), clap(0.3))                        # stamp pop
    if i < N: add(T(HOOK + PER * i) - 1.2 * B, riser(1.2 * B, 0.15))
add(T(END), kick(40, 1.5, 1.0)); add(T(END), clap(0.6))
fade = np.clip((TOTAL - np.arange(n) / SR) / 1.0, 0, 1); out *= fade
out = np.tanh(out * 1.2); out /= np.max(np.abs(out)) / 0.89
wavfile.write('jcbeat.wav', SR, (np.stack([out, out], 1) * 32767).astype(np.int16))
print('ok', TOTAL)
