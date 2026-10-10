import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Set(['index.html', 'styles.css', 'app.js', 'pages-demo.js', 'planner-browser.js', 'marketing-tools.js', 'workspace-ui.js', 'editor-state.js']);
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = path === '/Marketing101/' ? 'index.html' : path.startsWith('/Marketing101/') ? path.slice('/Marketing101/'.length) : '';
  if (!files.has(file)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(new URL(`../.pages-dist/${file}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${types[file.split('.').pop()]}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(500); res.end('Build the Pages demo first.'); }
});
server.listen(3102, '127.0.0.1', () => console.log('Static Pages preview: http://127.0.0.1:3102/Marketing101/'));
