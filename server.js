/* ========================================================
   Virtual Campus — Self-Hosted Multiplayer Server
   Run: npm install && npm start
   Then open: http://localhost:3000/virtual-campus.html
======================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

/* ============== MIME TYPES ============== */
const MIME = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.mp3':  'audio/mpeg',
    '.wav':  'audio/wav',
};

/* ============== STATIC FILE SERVER ============== */
const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/virtual-campus.html';

    const filePath = path.join(__dirname, urlPath);
    const ext = path.extname(filePath).toLowerCase();

    // Security: prevent path traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1>');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
});

/* ============== MULTIPLAYER STATE ============== */
const players = new Map();  // odId -> { id, name, emoji, x, y, roomId }
let nextId = 1;

/* ============== WEBSOCKET SERVER ============== */
const wss = new WebSocketServer({ server });

function broadcast(data, excludeWs = null) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === 1) {
            client.send(msg);
        }
    });
}

function getPlayerList() {
    return Array.from(players.values());
}

wss.on('connection', (ws) => {
    const playerId = 'p_' + nextId++;
    ws._playerId = playerId;

    console.log(`[+] Player connected: ${playerId} (${wss.clients.size} online)`);

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {

            /* Player announces themselves */
            case 'join': {
                const player = {
                    id: playerId,
                    name: msg.name || 'Guest',
                    emoji: msg.emoji || '🧑‍💻',
                    x: msg.x || 2300,
                    y: msg.y || 2800,
                    roomId: null
                };
                players.set(playerId, player);

                // Send the new player their ID + the full current player list
                ws.send(JSON.stringify({
                    type: 'welcome',
                    yourId: playerId,
                    players: getPlayerList()
                }));

                // Tell everyone else about the new player
                broadcast({ type: 'player_joined', player }, ws);
                console.log(`    ${player.name} joined as ${playerId}`);
                break;
            }

            /* Player moved */
            case 'move': {
                const p = players.get(playerId);
                if (!p) break;
                p.x = msg.x;
                p.y = msg.y;
                broadcast({ type: 'player_moved', id: playerId, x: msg.x, y: msg.y }, ws);
                break;
            }

            /* Player enters a room */
            case 'enter_room': {
                const p = players.get(playerId);
                if (!p) break;
                p.roomId = msg.roomId;
                broadcast({ type: 'player_entered_room', id: playerId, roomId: msg.roomId });
                break;
            }

            /* Player leaves a room */
            case 'leave_room': {
                const p = players.get(playerId);
                if (!p) break;
                const oldRoom = p.roomId;
                p.roomId = null;
                broadcast({ type: 'player_left_room', id: playerId, roomId: oldRoom });
                break;
            }

            /* Chat message */
            case 'chat': {
                const p = players.get(playerId);
                if (!p || !msg.message) break;
                // Broadcast to everyone (client filters by room)
                broadcast({
                    type: 'chat_msg',
                    id: playerId,
                    sender: p.name,
                    roomId: msg.roomId,
                    message: msg.message,
                    time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                });
                break;
            }
        }
    });

    ws.on('close', () => {
        const p = players.get(playerId);
        players.delete(playerId);
        broadcast({ type: 'player_left', id: playerId });
        console.log(`[-] Player disconnected: ${playerId} ${p ? '(' + p.name + ')' : ''} (${wss.clients.size} online)`);
    });

    ws.on('error', (err) => {
        console.error(`[!] WebSocket error for ${playerId}:`, err.message);
    });
});

/* ============== START ============== */
server.listen(PORT, () => {
    const interfaces = require('os').networkInterfaces();
    let lanIP = 'localhost';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                lanIP = iface.address;
                break;
            }
        }
    }

    console.log('');
    console.log('  ╔═══════════════════════════════════════════════╗');
    console.log('  ║       🏢 Virtual Campus Server Running       ║');
    console.log('  ╠═══════════════════════════════════════════════╣');
    console.log(`  ║  Local:   http://localhost:${PORT}/             ║`);
    console.log(`  ║  Network: http://${lanIP}:${PORT}/    ║`);
    console.log('  ╠═══════════════════════════════════════════════╣');
    console.log('  ║  Share the Network URL with others on your   ║');
    console.log('  ║  WiFi to let them join your campus!           ║');
    console.log('  ╚═══════════════════════════════════════════════╝');
    console.log('');
});
