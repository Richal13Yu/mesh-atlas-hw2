"""Mux a recorded browser walkthrough with optional local TTS and write subtitles."""
import argparse
import json
from pathlib import Path
import subprocess
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    return f'{milliseconds // 3600000:02}:{milliseconds // 60000 % 60:02}:{milliseconds // 1000 % 60:02},{milliseconds % 1000:03}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT.parent / 'submission')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    raw = ROOT / 'artifacts/demo-raw'
    scenes = {s['id']: s for s in json.loads((ROOT / 'scripts/demo_scenes.json').read_text())}
    timeline = json.loads((raw / 'timeline.json').read_text())
    video = Path((raw / 'video-path.txt').read_text().strip())
    if not video.is_absolute(): video = ROOT / video
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(video)]))
    if duration >= 180: raise ValueError(f'Demo exceeds 3 minutes: {duration:.2f} seconds')
    rate = 24000
    audio = np.zeros(int((duration + 1) * rate), dtype=np.int16)
    subtitles = []
    for i, segment in enumerate(timeline):
        with wave.open(str(raw / (segment['id'] + '.wav')), 'rb') as handle:
            assert handle.getframerate() == rate and handle.getnchannels() == 1 and handle.getsampwidth() == 2
            samples = np.frombuffer(handle.readframes(handle.getnframes()), dtype='<i2')
        start = round(segment['start'] * rate)
        audio[start:start + len(samples)] = samples
        subtitles.append(f"{i+1}\n{timestamp(segment['start'])} --> {timestamp(segment['start'] + segment['duration'])}\n{scenes[segment['id']]['text']}\n")
    narration = raw / 'narration.wav'
    with wave.open(str(narration), 'wb') as handle:
        handle.setnchannels(1); handle.setsampwidth(2); handle.setframerate(rate)
        handle.writeframes(audio.tobytes())
    (args.output / 'HW2_Demo.srt').write_text('\n'.join(subtitles))
    final = args.output / 'HW2_Demo.mp4'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(video), '-i', str(narration), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-t', str(duration), '-movflags', '+faststart', str(final)], check=True)
    metadata = {'duration_seconds': duration, 'resolution': '1440x1000', 'narration': 'Computer-generated English voice (macOS Samantha)', 'content': 'Actual browser interactions with local FastAPI/PyTorch service', 'video': final.name}
    (args.output / 'demo-metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
