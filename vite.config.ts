import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
export default defineConfig({
  base: './',
  plugins: [{ name: 'audio-study-report', generateBundle() {
    for (const name of ['report.md', 'validation.md', 'measurements.json', 'reference-measurements.png', 'reference-events.jpg',
      'rendered-audio.json', 'audition-desktop.png', 'audition-iphone.png', 'audition-android.png']) {
      this.emitFile({ type: 'asset', fileName: `audio-lab/${name}`,
        source: readFileSync(new URL(`./docs/audio-study-2026-10-24/${name}`, import.meta.url)) });
    }
    for (const name of ['v2-materials.png', 'v2-material-metrics.json', 'v2-rendered.json', 'v2-desktop.png', 'v2-iphone.png', 'v2-android.png']) {
      this.emitFile({ type: 'asset', fileName: `audio-lab/${name}`,
        source: readFileSync(new URL(`./docs/audio-lab-v2/${name}`, import.meta.url)) });
    }
    this.emitFile({ type: 'asset', fileName: 'audio-lab/samples-report.md',
      source: readFileSync(new URL('./docs/audio-samples/README.md', import.meta.url)) });
    this.emitFile({ type: 'asset', fileName: 'audio-lab/v2-report.md',
      source: readFileSync(new URL('./docs/audio-lab-v2/README.md', import.meta.url)) });
  } }],
  build: { target: 'es2020', rollupOptions: { input: ['index.html', 'audio-lab/index.html', 'audio-lab/v2.html', 'audio-lab/samples.html', 'audio-lab/scenes.html'] } },
  server: { port: 3000, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
