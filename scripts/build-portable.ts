// Downloadable preview of the same source, not a second implementation.
export {};
const result = await Bun.build({
  entrypoints: ['src/index.ts'], target: 'browser', format: 'iife', minify: true,
  define: { 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'inline-css-in-html', setup(build) {
    build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  } }],
});
if (!result.success) throw new Error(result.logs.join('\n'));
const script = (await result.outputs[0].text()).replaceAll('</script', '<\\/script');
const style = await Bun.file('src/style.css').text();
const source = await Bun.file('index.html').text();
const html = source.replace('</head>', `<style>${style}</style></head>`)
  .replace('<script type="module" src="/src/index.ts"></script>', `<script>${script}</script>`);
await Bun.write('artifacts/block-blast-mvp.html', html);
console.log('Created artifacts/block-blast-mvp.html (self-contained browser preview).');
