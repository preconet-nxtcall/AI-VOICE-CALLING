import numpy as np
import base64

def _ulaw2lin(data: bytes) -> bytes:
    _mu2lin = np.zeros(256, dtype=np.int16)
    for i in range(256):
        v = ~i & 0xFF
        sign = v & 0x80
        exponent = (v & 0x70) >> 4
        mantissa = v & 0x0F
        sample = (mantissa << 3) + 132
        sample <<= exponent
        sample -= 132
        _mu2lin[i] = -sample if sign else sample
    indices = np.frombuffer(data, dtype=np.uint8)
    return _mu2lin[indices].tobytes()

def _lin2ulaw(data: bytes) -> bytes:
    pcm = np.frombuffer(data, dtype=np.int16).astype(np.int32)
    sign = (pcm < 0)
    pcm = np.abs(pcm)
    pcm = np.clip(pcm + 132, 132, 32767)
    exponent = np.zeros_like(pcm, dtype=np.uint8)
    for i in range(7):
        mask = 1 << (14 - i)
        exponent[np.logical_and(exponent == 0, (pcm & mask) != 0)] = 7 - i
    mantissa = (pcm >> (exponent + 3)) & 0x0F
    ulaw = ~( (sign << 7) | (exponent << 4) | mantissa )
    return (ulaw & 0xFF).astype(np.uint8).tobytes()

# Test with a simple sine wave
duration = 0.1 # seconds
fs = 8000
t = np.linspace(0, duration, int(fs * duration), endpoint=False)
pcm_in = (np.sin(2 * np.pi * 440 * t) * 10000).astype(np.int16).tobytes()

ulaw = _lin2ulaw(pcm_in)
pcm_out = _ulaw2lin(ulaw)

# Convert back to arrays for comparison
arr_in = np.frombuffer(pcm_in, dtype=np.int16)
arr_out = np.frombuffer(pcm_out, dtype=np.int16)

error = np.mean(np.abs(arr_in.astype(float) - arr_out.astype(float)))
print(f"Mean Absolute Error: {error:.2f}")
if error < 50: # mu-law is lossy but shouldn't be wildly different
    print("Conversion logic looks healthy!")
else:
    print("Conversion logic might be flawed.")
