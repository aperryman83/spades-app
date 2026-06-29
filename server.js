/**
 * server.js
 *
 * Static file server + API proxy for Uncle Ray's AI brain.
 *
 * Serves the game files and provides a POST /api/ray endpoint
 * that proxies conversations to Claude Haiku. The API key stays
 * server-side (in Replit Secrets) — the browser never sees it.
 *
 * Run: node server.js
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5000;

// ═════════════════════════════════════════════════════════════════════════════
// MIME TYPES — So browsers handle files correctly
// ═════════════════════════════════════════════════════════════════════════════

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ═════════════════════════════════════════════════════════════════════════════
// API PROXY — POST /api/ray
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Proxies a conversation to Claude Haiku.
 * Expects JSON body:
 * {
 *   systemPrompt: string,   // Ray's personality + game context
 *   messages: [             // conversation history
 *     { role: 'assistant', content: '...' },
 *     { role: 'user', content: '...' },
 *   ]
 * }
 *
 * Returns JSON:
 * { reply: string }  or  { error: string }
 */
async function handleRayAPI(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API key not configured. Add ANTHROPIC_API_KEY to Replit Secrets.' }));
    return;
  }

  // Read the request body
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON in request body.' }));
    return;
  }

  const { systemPrompt, messages, model } = parsed;

  if (!systemPrompt || !messages) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing systemPrompt or messages.' }));
    return;
  }

  // Call Claude Haiku
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `API returned ${response.status}` }));
      return;
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply }));
  } catch (err) {
    console.error('API proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to reach AI service.' }));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// STATIC FILE SERVER
// ═════════════════════════════════════════════════════════════════════════════

function serveStaticFile(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;

  // Strip query strings
  filePath = filePath.split('?')[0];

  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// REQUEST ROUTER
// ═════════════════════════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  // CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API routes
  if (req.method === 'POST' && req.url === '/api/ray') {
    await handleRayAPI(req, res);
    return;
  }

  // Everything else: static files
  serveStaticFile(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Spades with Uncle Ray — running on port ${PORT}`);
  console.log(`API key configured: ${process.env.ANTHROPIC_API_KEY ? 'YES' : 'NO'}`);
});
