"""Optional macOS narration for the browser demo; requires say and ffmpeg."""
import argparse
import json
from pathlib import Path
import subprocess
import wave

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--voice', default='Samantha')
    parser.add_argument('--rate', type=int, default=175)
    args = parser.parse_args()
    folder = ROOT / 'artifacts/demo-raw'
    folder.mkdir(parents=True, exist_ok=True)
    scenes = json.loads((ROOT / 'scripts/demo_scenes.json').read_text())
    for scene in scenes:
        text = folder / (scene['id'] + '.txt')
        aiff = folder / (scene['id'] + '.aiff')
        wav = folder / (scene['id'] + '.wav')
        text.write_text(scene['text'])
        subprocess.run(['say', '-v', args.voice, '-r', str(args.rate), '-f', str(text), '-o', str(aiff)], check=True)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(aiff), '-ar', '24000', '-ac', '1', str(wav)], check=True)
        with wave.open(str(wav)) as handle:
            scene['duration'] = handle.getnframes() / handle.getframerate()
    (folder / 'scenes.json').write_text(json.dumps(scenes, indent=2) + '\n')
    print(f"Narration: {sum(scene['duration'] for scene in scenes):.2f} seconds")


if __name__ == '__main__':
    main()
