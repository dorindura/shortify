import librosa
import numpy as np
import json
import sys

def analyze_audio_energy(audio_path, hop_ms=250):
    y, sr = librosa.load(audio_path, sr=None, mono=True)

    hop_length = int(sr * hop_ms / 1000)
    frame_length = hop_length * 2

    rms = librosa.feature.rms(
        y=y,
        frame_length=frame_length,
        hop_length=hop_length
    )[0]

    times = librosa.frames_to_time(
        np.arange(len(rms)),
        sr=sr,
        hop_length=hop_length
    )

    max_rms = np.max(rms) or 1.0

    frames = []
    for i, val in enumerate(rms):
        frames.append({
            "tStart": float(times[i]),
            "tEnd": float(times[i] + hop_ms / 1000),
            "energy": float(val / max_rms)
        })

    return frames

if __name__ == "__main__":
    audio_path = sys.argv[1]
    result = analyze_audio_energy(audio_path)
    print(json.dumps(result))
