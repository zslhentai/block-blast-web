// Local static preview only. Production deployment is the dist/ directory.
import { resolve, sep } from 'node:path';
const root = resolve('dist');
const prefix = '/block-blast-web/';
const server = Bun.serve({
  hostname: process.env.BLOCK_BLAST_HOST ?? '127.0.0.1',
  port: Number(process.env.BLOCK_BLAST_PORT ?? 4173),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === prefix.slice(0, -1)) return Response.redirect(`${url.origin}${prefix}`, 302);
    if (!url.pathname.startsWith(prefix)) return new Response('Not found', { status: 404 });
    let name: string;
    try { name = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html'; }
    catch { return new Response('Bad path', { status: 400 }); }
    const path = resolve(root, name);
    if (!path.startsWith(root + sep)) return new Response('Not found', { status: 404 });
    const file = Bun.file(path);
    if (!await file.exists()) return new Response('Not found', { status: 404 });
    return new Response(file, { headers: { 'Cache-Control': 'no-store' } });
  },
});
console.log(`Static production preview listening on port ${server.port}, path ${prefix}`);
