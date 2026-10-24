// Reproducible ORIGINAL PCM assets; never reads the reference recording.
import { createPcmPair, encodeWav, KINDS, DIRECTIONS, PCM_RATE, stats } from '../src/audio/lab-v2/pcm';
const assets = [];
for (const kind of KINDS) {
  const pair = createPcmPair(kind);
  for (const direction of DIRECTIONS) {
    const name = `${kind}-${direction}.wav`; const bytes = encodeWav(pair[direction]);
    await Bun.write(`public/audio-lab-v2/${name}`, bytes);
    assets.push({ name, sampleRate: PCM_RATE, frames: pair[direction].length, ...stats(pair[direction]),
      sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex') });
  }
}
await Bun.write('public/audio-lab-v2/manifest.json', JSON.stringify({
  generator: 'scripts/build-audio-lab-v2.ts', provenance: 'Original deterministic time-domain synthesis, no recorded or third-party audio input.',
  encoding: 'PCM16 mono 48000 Hz', assets,
}, null, 2) + '\n');
console.log(`Generated ${assets.length} original PCM WAVs`);
