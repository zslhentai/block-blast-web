#!/usr/bin/env python3
"""Edit existing licensed recordings only. No generated tones/noise/IR or network access.
Requires FFmpeg. Run from repository root; originals are already checked in.
"""
import array
import hashlib
import json
import math
import pathlib
import subprocess
import sys
import wave

ROOT = pathlib.Path(__file__).resolve().parent.parent
BANK = ROOT / 'public/audio-samples'
RATE = 48000


def decode(path, filters=None):
    command = ['ffmpeg', '-v', 'error', '-i', str(path)]
    if filters:
        # Align decoded timestamps before trimming; OGG priming may use negative PTS.
        command += ['-af', 'asetpts=PTS-STARTPTS,' + filters]
    command += ['-ar', str(RATE), '-ac', '2', '-f', 'f32le', '-c:a', 'pcm_f32le', '-']
    result = subprocess.run(command, check=True, capture_output=True).stdout
    data = array.array('f', result)
    if sys.byteorder != 'little':
        data.byteswap()
    if filters:
        # Finish the preview de-click fade AFTER resampling so the endpoint is exactly zero.
        frames = len(data) // 2
        tail = min(round(RATE * .005), frames)
        for frame in range(tail):
            multiplier = (tail - 1 - frame) / max(1, tail - 1)
            at = (frames - tail + frame) * 2
            data[at] *= multiplier
            data[at + 1] *= multiplier
    return data


def metrics(data):
    return {'frames': len(data) // 2, 'duration': len(data) / (2 * RATE),
            'peak': max(abs(x) for x in data),
            'rms': math.sqrt(sum(x * x for x in data) / len(data))}


def save(path, data, gain):
    pcm = array.array('h', (round(max(-1, min(1, x * gain)) * 32767) for x in data))
    if sys.byteorder != 'little':
        pcm.byteswap()
    with wave.open(str(path), 'wb') as output:
        output.setparams((2, 2, RATE, len(pcm) // 2, 'NONE', 'not compressed'))
        output.writeframes(pcm.tobytes())
    return hashlib.sha256(path.read_bytes()).hexdigest()


catalog = []
for recipe in json.loads((ROOT / 'scripts/sample-recipes.json').read_text()):
    stem = recipe['id']
    ext = pathlib.Path(recipe['path']).suffix
    original = BANK / 'original' / (stem + ext)
    raw = original.read_bytes()
    assert len(raw) == recipe['bytes']
    assert hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest() == recipe['gitBlob']
    full = decode(original)
    start = recipe['start']
    raw_end = min(start + recipe['previewSeconds'], len(full) / (2 * RATE))
    edited_end = min(start + recipe['editedSeconds'], raw_end)
    # Same start point, no time stretch/pitch alteration or artificial layers.
    a = decode(original, f'atrim=start={start}:end={raw_end},asetpts=PTS-STARTPTS,afade=t=out:st={max(0,raw_end-start-.005)}:d=0.005')
    duration = edited_end - start
    fade = recipe['fadeMs'] / 1000
    filters = (f'atrim=start={start}:end={edited_end},asetpts=PTS-STARTPTS,'
               f'highpass=f={recipe["highpass"]},lowpass=f={recipe["lowpass"]},'
               f'equalizer=f=3600:t=q:w=0.8:g={recipe["eqDbAt3600"]},'
               f'afade=t=in:d=0.002,afade=t=out:st={max(0,duration-fade)}:d={fade}')
    b = decode(original, filters)
    # One common preview gain for BOTH versions, never a louder B as a shortcut.
    gain = .33 / max(metrics(a)['peak'], metrics(b)['peak'])
    files = {'A': f'preview/{stem}.wav', 'B': f'edited/{stem}.wav', 'original': f'original/{stem}{ext}'}
    hashes = {'original': hashlib.sha256(raw).hexdigest()}
    for key, data in [('A', a), ('B', b)]:
        hashes[key] = save(BANK / files[key], data, gain)
    entry = {key: recipe[key] for key in ['id','group','code','title','note','pack','author','official','origin','repo','commit','path','url','gitBlob','license','licenseUrl']}
    entry.update({'review': '初筛，未做人工听审；相似度待用户确认', 'files': files, 'sha256': hashes,
                  'originalMetrics': metrics(full), 'previewRange': [start, raw_end],
                  'editedRange': [start, edited_end], 'sharedGainDb': 20 * math.log10(gain),
                  'highpassHz': recipe['highpass'], 'lowpassHz': recipe['lowpass'], 'eqDbAt3600': recipe['eqDbAt3600'],
                  'fadeOutMs': recipe['fadeMs'], 'baselineEndFadeMs': 5,
                  'stats': {key: {**metrics(data), 'peak': metrics(data)['peak'] * gain, 'rms': metrics(data)['rms'] * gain} for key, data in [('A', a), ('B', b)]},
                  'licenseFile': f'licenses/{recipe["key"]}-CC0.txt'})
    catalog.append(entry)
    print(stem, 'A', round(raw_end-start,3), 'B', round(duration,3), 'shared gain dB', round(entry['sharedGainDb'],1))
(BANK / 'catalog.json').write_text(json.dumps({'version': 1, 'date': '2026-10-24', 'items': catalog}, ensure_ascii=False, indent=2) + '\n')
