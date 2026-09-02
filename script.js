/* ========================================================
   VIRTUAL CAMPUS — Self-Hosted Multiplayer
   Connects to local WebSocket server for real-time sync.
   No external services — fully standalone.
======================================================== */

/* ========== STATE ========== */
let ME = null;
let myId = null;        // assigned by the server
let dbRooms = [];
let currentRoomId = null, currentRoomData = null, nearbyRoom = null, lastNearbyId = null;
let otherSprites = {};  // { playerId: { container, label } }
let ws = null;          // WebSocket connection

/* ========== ROOMS DATA (built-in) ========== */
const ROOMS = [
    { id: 'r1', name: 'Hardware Lab',    icon: '🔧', color: '#3b82f6', max_capacity: 6 },
    { id: 'r2', name: 'Software Lab',    icon: '💻', color: '#8b5cf6', max_capacity: 8 },
    { id: 'r3', name: 'AI / ML Lab',     icon: '🤖', color: '#06b6d4', max_capacity: 6 },
    { id: 'r4', name: 'IoT Lab',         icon: '📡', color: '#10b981', max_capacity: 6 },
    { id: 'r5', name: 'Innovation Hub',   icon: '🚀', color: '#f59e0b', max_capacity: 12 },
    { id: 'r6', name: 'Design Studio',   icon: '🎨', color: '#ec4899', max_capacity: 6 },
    { id: 'r7', name: 'Conference Room',  icon: '📋', color: '#6366f1', max_capacity: 10 },
    { id: 'r8', name: 'Break Lounge',     icon: '☕', color: '#f97316', max_capacity: 8 }
];

/* Room layout coordinates */
const ROOM_DEFS = [
    {x:1000, y:1000, w:750, h:600},
    {x:2100, y:1000, w:700, h:600},
    {x:3200, y:1000, w:750, h:650},
    {x:1000, y:2300, w:650, h:750},
    {x:2300, y:2300, w:950, h:900},
    {x:3400, y:2300, w:650, h:700},
    {x:1500, y:3500, w:950, h:600},
    {x:3000, y:3500, w:750, h:600}
];

function renderAvatar(emojiOrFa) {
    if (!emojiOrFa) return '<i class="fas fa-user-astronaut"></i>';
    if (emojiOrFa.includes('fa-')) return `<i class="${emojiOrFa}"></i>`;
    return emojiOrFa;
}

/* ========== HELPERS ========== */
function strToColor(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    const r = Math.abs(h >> 16) % 180 + 75;
    const g = Math.abs(h >> 8) % 180 + 75;
    const b = Math.abs(h) % 180 + 75;
    return Phaser.Display.Color.GetColor(r, g, b);
}

function escH(s) {
    return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function formatTime(date) {
    const h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m} ${ampm}`;
}

/* ========== WEBSOCKET CONNECTION ========== */
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}`;

    ws = new WebSocket(url);

    ws.onopen = () => {
        console.log('[WS] Connected to server');
        // Announce ourselves
        ws.send(JSON.stringify({
            type: 'join',
            name: ME.full_name,
            emoji: ME.avatar_emoji,
            x: 2300,
            y: 2800
        }));
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
    };

    ws.onclose = () => {
        console.log('[WS] Disconnected. Reconnecting in 3s...');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
        console.warn('[WS] Connection error — running in offline mode');
    };
}

function wsSend(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

/* ========== HANDLE SERVER MESSAGES ========== */
function handleServerMessage(msg) {
    switch (msg.type) {

        case 'welcome':
            myId = msg.yourId;
            // Spawn all existing players
            for (const p of msg.players) {
                if (p.id !== myId) spawnOtherPlayer(p);
            }
            break;

        case 'player_joined':
            if (msg.player.id !== myId) spawnOtherPlayer(msg.player);
            break;

        case 'player_moved':
            if (msg.id !== myId) moveOtherPlayer(msg.id, msg.x, msg.y);
            break;

        case 'player_entered_room':
            if (msg.id !== myId && currentRoomId) refreshMembersBar();
            break;

        case 'player_left_room':
            if (msg.id !== myId && currentRoomId) refreshMembersBar();
            break;

        case 'player_left':
            removeOtherPlayer(msg.id);
            if (currentRoomId) refreshMembersBar();
            break;

        case 'chat_msg':
            // Only show if we're in the same room
            if (msg.roomId === currentRoomId) {
                renderMsg({ sender: msg.sender, message: msg.message, time: msg.time });
            }
            break;
    }
}

/* ========== OTHER PLAYERS RENDERING ========== */
function spawnOtherPlayer(p) {
    const scene = game?.scene?.scenes[0];
    if (!scene) return;

    if (otherSprites[p.id]) return; // already spawned

    const col = strToColor(p.name);
    const g = scene.add.graphics();
    g.fillStyle(col, 0.18); g.fillCircle(0, 0, 32);
    g.fillStyle(col, 1);   g.fillCircle(0, 0, 20);
    g.lineStyle(3, 0xffffff, 0.8); g.strokeCircle(0, 0, 20);

    const emoji = (p.emoji && p.emoji.includes('fa-')) ? '👤' : (p.emoji || '😊');
    const em = scene.add.text(0, 0, emoji, { fontSize: '20px' }).setOrigin(0.5, 0.5);
    const cont = scene.add.container(p.x || 2300, p.y || 2800, [g, em]).setDepth(8);

    const lbl = scene.add.text(p.x || 2300, (p.y || 2800) - 40, p.name, {
        fontFamily: 'Inter, sans-serif', fontSize: '12px', fontStyle: 'bold',
        color: '#fff', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(9);

    otherSprites[p.id] = { container: cont, label: lbl, name: p.name, emoji: p.emoji, roomId: p.roomId };
}

function moveOtherPlayer(id, x, y) {
    const sp = otherSprites[id];
    if (!sp) return;
    // Smooth tween to new position
    const scene = game?.scene?.scenes[0];
    if (scene) {
        scene.tweens.add({ targets: sp.container, x, y, duration: 150, ease: 'Linear' });
        scene.tweens.add({ targets: sp.label, x, y: y - 40, duration: 150, ease: 'Linear' });
    }
}

function removeOtherPlayer(id) {
    const sp = otherSprites[id];
    if (!sp) return;
    sp.container?.destroy();
    sp.label?.destroy();
    delete otherSprites[id];
}

/* ========== INIT ========== */
function initApp() {
    // Get or prompt for player name
    let savedName = localStorage.getItem('campus_username');
    if (!savedName) {
        savedName = prompt('Enter your name for the Virtual Campus:', 'Explorer') || 'Explorer';
        localStorage.setItem('campus_username', savedName);
    }

    ME = {
        id: 'local_user',
        full_name: savedName,
        avatar_emoji: '🧑‍💻',
        level: 1,
        xp: 0
    };
    dbRooms = ROOMS;

    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loading').style.opacity = '0';
        setTimeout(() => { document.getElementById('loading').style.display = 'none'; }, 600);
    }, 1800);

    initPhaser();
    connectWebSocket();
}

/* ========== PROXIMITY POPUP ========== */
function showPopup(room) {
    if (lastNearbyId === room.id || currentRoomId) return;
    lastNearbyId = room.id;
    nearbyRoom = room;

    document.getElementById('pop-name').textContent = (room.icon || '') + ' ' + room.name;

    // Count players in this room
    let count = 0;
    for (const sp of Object.values(otherSprites)) {
        if (sp.roomId === room.id) count++;
    }
    document.getElementById('pop-cap').textContent = `Members: ${count} / ${room.max_capacity}`;

    const list = document.getElementById('pop-list');
    if (count === 0) {
        list.innerHTML = '<div class="pop-empty">No one here yet. Be the first!</div>';
    } else {
        list.innerHTML = '';
        for (const [id, sp] of Object.entries(otherSprites)) {
            if (sp.roomId === room.id) {
                list.innerHTML += `<div class="pop-row">${renderAvatar(sp.emoji)} ${escH(sp.name)}</div>`;
            }
        }
    }
    document.getElementById('popup').classList.add('show');
}

function hidePopup() {
    lastNearbyId = null; nearbyRoom = null;
    document.getElementById('popup').classList.remove('show');
}

function enterNearby() { if (nearbyRoom) joinRoom(nearbyRoom); }

/* ========== JOIN / LEAVE ROOM ========== */
function joinRoom(room) {
    if (currentRoomId) leaveRoom();
    hidePopup();
    currentRoomId = room.id;
    currentRoomData = room;

    // Notify server
    wsSend({ type: 'enter_room', roomId: room.id });

    const label = (room.icon || '') + ' ' + room.name;
    document.getElementById('wrap').classList.add('in-room');
    document.getElementById('room-hud').classList.add('show');
    document.getElementById('room-hud-name').textContent = label;
    document.getElementById('btn-leave').classList.add('show');
    document.getElementById('btn-back').style.display = 'none';
    document.getElementById('mbar').classList.add('show');
    document.getElementById('hint').style.display = 'none';
    document.getElementById('chat-title').textContent = label;
    document.getElementById('drawer-title').textContent = label;

    clearChats();
    refreshMembersBar();
    if (phaserPlayer) phaserPlayer.body.setVelocity(0, 0);
}

function leaveRoom() {
    if (!currentRoomId) return;

    // Notify server
    wsSend({ type: 'leave_room' });

    currentRoomId = null; currentRoomData = null;

    document.getElementById('wrap').classList.remove('in-room');
    document.getElementById('room-hud').classList.remove('show');
    document.getElementById('btn-leave').classList.remove('show');
    document.getElementById('btn-back').style.display = 'inline-flex';
    document.getElementById('mbar').classList.remove('show');
    document.getElementById('mbar').innerHTML = '';
    document.getElementById('hint').style.display = 'flex';
    document.getElementById('drawer').classList.remove('open');

    clearChats();
    document.getElementById('d-msgs').innerHTML = '<div class="chat-empty">Enter a room to start chatting.</div>';
    document.getElementById('m-msgs').innerHTML = '<div class="chat-empty">Enter a room to start chatting.</div>';
}

/* ========== MEMBERS BAR ========== */
function refreshMembersBar() {
    if (!currentRoomId || !currentRoomData) return;
    const bar = document.getElementById('mbar');
    bar.innerHTML = '';

    // Add self
    let count = 1;
    bar.innerHTML += `<div class="mc">
        <div class="mc-dot"></div>
        <div class="mc-av">${renderAvatar(ME.avatar_emoji)}</div>
        <div>
            <div class="mc-name">${escH(ME.full_name)} (You)</div>
            <div class="mc-sub"><span>Online</span></div>
        </div></div>`;

    // Add other players in same room
    for (const [id, sp] of Object.entries(otherSprites)) {
        if (sp.roomId === currentRoomId) {
            count++;
            bar.innerHTML += `<div class="mc">
                <div class="mc-dot"></div>
                <div class="mc-av">${renderAvatar(sp.emoji)}</div>
                <div>
                    <div class="mc-name">${escH(sp.name)}</div>
                    <div class="mc-sub"><span>Online</span></div>
                </div></div>`;
        }
    }
    document.getElementById('room-hud-cap').textContent = `${count} / ${currentRoomData.max_capacity}`;
}

/* ========== CHAT ========== */
function clearChats() {
    document.getElementById('d-msgs').innerHTML = '';
    document.getElementById('m-msgs').innerHTML = '';
}

function renderMsg(obj, scroll=true) {
    const me = obj.sender === ME.full_name;
    const txt = escH(obj.message);
    const html = `<div class="msg ${me?'me':'oth'}">
        <div class="msender">${escH(obj.sender)}</div>
        <div class="mbody">${txt}</div>
        <div class="mtime">${obj.time}</div>
    </div>`;
    document.getElementById('d-msgs').insertAdjacentHTML('beforeend', html);
    document.getElementById('m-msgs').insertAdjacentHTML('beforeend', html);
    if (scroll) scrollDown();
}

function scrollDown() {
    const d = document.getElementById('d-msgs'), m = document.getElementById('m-msgs');
    d.scrollTop = d.scrollHeight; m.scrollTop = m.scrollHeight;
}

function sendMsg(ctx) {
    const id = ctx === 'm' ? 'm-inp' : 'd-inp';
    const el = document.getElementById(id);
    const txt = el.value.trim();
    if (!txt || !currentRoomId) return;
    el.value = '';

    // Send through server — server broadcasts to everyone including sender
    wsSend({ type: 'chat', roomId: currentRoomId, message: txt });
}

function toggleDrawer() {
    document.getElementById('drawer').classList.toggle('open');
    scrollDown();
}

/* ========== PHASER ========== */
let game, phaserPlayer, cursors, wasd, roomZones = [];

function initPhaser() {
    const W = document.getElementById('canvas-col').clientWidth || window.innerWidth;
    const H = window.innerHeight;
    game = new Phaser.Game({
        type: Phaser.WEBGL,
        parent: 'game-container',
        width: W, height: H,
        backgroundColor: '#0b1015',
        physics: { default: 'arcade', arcade: { gravity: {y:0} } },
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: { preload: scenePreload, create: sceneCreate, update: sceneUpdate }
    });
}

function scenePreload() {
    this.load.image('floor', 'assets/office_floor.jpg');
}

function sceneCreate() {
    const WW = 4600, WH = 4600;
    this.physics.world.setBounds(0, 0, WW, WH);

    /* ============== GROUND ============== */
    const gfx = this.add.graphics();
    this.add.tileSprite(WW/2, WH/2, WW*2, WH*2, 'floor').setAlpha(0.18).setScale(0.5);
    gfx.fillStyle(0x0a0c10, 0.65);
    gfx.fillRect(0, 0, WW, WH);

    // Grid
    const gridG = this.add.graphics();
    gridG.lineStyle(1, 0x1a2035, 0.35);
    for (let gx = 0; gx <= WW; gx += 80) gridG.strokeLineShape(new Phaser.Geom.Line(gx, 0, gx, WH));
    for (let gy = 0; gy <= WH; gy += 80) gridG.strokeLineShape(new Phaser.Geom.Line(0, gy, WW, gy));

    // Corridors
    const pathG = this.add.graphics();
    pathG.fillStyle(0x1a2035, 0.4);
    pathG.fillRect(220, 1650, WW-440, 280);
    pathG.fillRect(220, 2950, WW-440, 280);
    pathG.fillRect(1600, 220, 280, WH-440);
    pathG.fillRect(2850, 220, 280, WH-440);
    pathG.lineStyle(2, 0x3b82f6, 0.08);
    pathG.strokeLineShape(new Phaser.Geom.Line(220, 1790, WW-220, 1790));
    pathG.strokeLineShape(new Phaser.Geom.Line(220, 3090, WW-220, 3090));
    pathG.strokeLineShape(new Phaser.Geom.Line(1740, 220, 1740, WH-220));
    pathG.strokeLineShape(new Phaser.Geom.Line(2990, 220, 2990, WH-220));

    /* ============== OFFICE PLANTS ============== */
    const treePts = [];
    for (let tx = 300; tx < WW-200; tx += 250) { treePts.push({x:tx, y:140}); treePts.push({x:tx, y:WH-140}); }
    for (let ty = 300; ty < WH-200; ty += 250) { treePts.push({x:140, y:ty}); treePts.push({x:WW-140, y:ty}); }
    treePts.push(
        {x:1700,y:600},{x:2300,y:600},{x:2900,y:600},
        {x:1700,y:4000},{x:2300,y:4000},{x:2900,y:4000},
        {x:500,y:1800},{x:500,y:2500},{x:500,y:3200},
        {x:4100,y:1800},{x:4100,y:2500},{x:4100,y:3200}
    );
    for (const t of treePts) {
        const pg = this.add.graphics();
        pg.fillStyle(0x000000, 0.3); pg.fillEllipse(t.x+4, t.y+18, 40, 16);
        pg.fillStyle(0x3a3530, 1); pg.fillRoundedRect(t.x-12, t.y-4, 24, 20, 4);
        pg.fillStyle(0x4a4540, 1); pg.fillRoundedRect(t.x-14, t.y-6, 28, 8, 3);
        pg.fillStyle(0x166534, 0.9); pg.fillCircle(t.x, t.y-12, 18);
        pg.fillStyle(0x15803d, 0.9); pg.fillCircle(t.x-8, t.y-16, 12); pg.fillCircle(t.x+7, t.y-14, 11);
        pg.fillStyle(0x22c55e, 0.7); pg.fillCircle(t.x-3, t.y-20, 8); pg.fillCircle(t.x+5, t.y-18, 7);
        pg.fillStyle(0x4ade80, 0.5); pg.fillCircle(t.x, t.y-22, 5);
    }

    /* ============== DESK HELPER ============== */
    function drawDesk(scene, gfx, dx, dy, col) {
        gfx.fillStyle(0x000000, 0.25); gfx.fillRoundedRect(dx-38+4, dy-22+4, 76, 44, 3);
        gfx.fillStyle(0x5c4033, 1); gfx.fillRoundedRect(dx-38, dy-22, 76, 44, 3);
        gfx.fillStyle(0x6d503f, 1); gfx.fillRoundedRect(dx-36, dy-20, 72, 40, 2);
        gfx.lineStyle(1, 0x7a5d4a, 0.3);
        gfx.strokeLineShape(new Phaser.Geom.Line(dx-30, dy-12, dx+30, dy-12));
        gfx.strokeLineShape(new Phaser.Geom.Line(dx-28, dy, dx+28, dy));
        gfx.strokeLineShape(new Phaser.Geom.Line(dx-30, dy+10, dx+30, dy+10));
        gfx.fillStyle(0x1e293b, 1); gfx.fillRoundedRect(dx-16, dy-20, 32, 20, 2);
        gfx.fillStyle(col, 0.5); gfx.fillRoundedRect(dx-14, dy-18, 28, 16, 1);
        gfx.fillStyle(0x334155, 1); gfx.fillRect(dx-3, dy-1, 6, 4); gfx.fillRect(dx-8, dy+2, 16, 3);
        gfx.fillStyle(0x1e293b, 1); gfx.fillRoundedRect(dx-18, dy+7, 36, 10, 2);
        gfx.fillStyle(0x334155, 1);
        for (let kx = dx-16; kx < dx+16; kx += 5) { for (let ky = dy+8; ky < dy+15; ky += 4) { gfx.fillRect(kx, ky, 3, 2); } }
        gfx.fillStyle(0xf1f5f9, 1); gfx.fillCircle(dx+28, dy+6, 5);
        gfx.fillStyle(0x78350f, 1); gfx.fillCircle(dx+28, dy+6, 3.5);
        gfx.lineStyle(1.5, 0xf1f5f9, 1); gfx.strokeCircle(dx+33, dy+6, 3);
        gfx.fillStyle(0x1e1e2e, 1); gfx.fillCircle(dx, dy+32, 14);
        gfx.fillStyle(0x2a2a3e, 1); gfx.fillCircle(dx, dy+32, 11);
        gfx.fillStyle(0x1e1e2e, 1); gfx.fillRoundedRect(dx-16, dy+26, 6, 12, 2); gfx.fillRoundedRect(dx+10, dy+26, 6, 12, 2);
        gfx.fillStyle(0x111111, 1); gfx.fillCircle(dx-12, dy+40, 2.5); gfx.fillCircle(dx+12, dy+40, 2.5); gfx.fillCircle(dx, dy+44, 2.5);
    }

    /* ============== ROOMS ============== */
    const wallGroup = this.physics.add.staticGroup();

    dbRooms.forEach((room, idx) => {
        const def = ROOM_DEFS[idx % ROOM_DEFS.length];
        const { x, y, w, h } = def;
        const hW = w/2, hH = h/2;
        const col = parseInt((room.color || '#3b82f6').replace('#','0x'));
        const capacity = room.max_capacity || 6;
        const rg = this.add.graphics();

        rg.fillStyle(0x000000, 0.45); rg.fillRoundedRect(x-hW+12, y-hH+12, w, h, 8);
        rg.fillStyle(0x151b2b, 1); rg.fillRoundedRect(x-hW, y-hH, w, h, 6);

        const tileSize = 55;
        for (let tx = x-hW+4; tx < x+hW-4; tx += tileSize) {
            for (let ty = y-hH+56; ty < y+hH-4; ty += tileSize) {
                rg.fillStyle(0x1a2238, 1); rg.fillRect(tx+1, ty+1, tileSize-2, tileSize-2);
            }
        }

        const COLS = Math.min(3, Math.ceil(Math.sqrt(capacity)));
        const ROWS = Math.ceil(capacity / COLS);
        const spacingX = (w - 140) / COLS;
        const spacingY = (h - 180) / Math.max(ROWS, 1);
        const startX = x - hW + 70 + spacingX * 0.4;
        const startY = y - hH + 120;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (r * COLS + c >= capacity) break;
                drawDesk(this, rg, startX + c * spacingX, startY + r * spacingY, col);
            }
        }

        rg.lineStyle(6, col, 0.8); rg.strokeRoundedRect(x-hW, y-hH, w, h, 6);
        rg.lineStyle(1, col, 0.2); rg.strokeRoundedRect(x-hW+5, y-hH+5, w-10, h-10, 4);
        rg.fillStyle(col, 0.2); rg.fillRoundedRect(x-hW, y-hH, w, 52, {tl:6, tr:6, bl:0, br:0});
        rg.lineStyle(1, col, 0.4); rg.strokeLineShape(new Phaser.Geom.Line(x-hW, y-hH+52, x+hW, y-hH+52));

        const doorW = 80;
        rg.fillStyle(0x151b2b, 1); rg.fillRect(x - doorW/2, y+hH-4, doorW, 10);
        rg.lineStyle(3, col, 0.7);
        rg.strokeLineShape(new Phaser.Geom.Line(x-doorW/2, y+hH-6, x-doorW/2, y+hH+6));
        rg.strokeLineShape(new Phaser.Geom.Line(x+doorW/2, y+hH-6, x+doorW/2, y+hH+6));
        rg.fillStyle(col, 0.12); rg.fillRoundedRect(x-doorW/2+6, y+hH+3, doorW-12, 10, 3);
        rg.fillStyle(col, 0.5); rg.fillTriangle(x, y+hH+16, x-8, y+hH+8, x+8, y+hH+8);

        this.add.text(x - 20, y-hH+12, room.icon || '🏢', { fontSize:'24px' }).setOrigin(.5, 0).setDepth(2);
        this.add.text(x + 10, y-hH+14, room.name, {
            fontFamily:'Outfit,sans-serif', fontSize:'16px', fontStyle:'bold',
            color: room.color || '#aaccff', stroke:'#000', strokeThickness:3
        }).setOrigin(.5, 0).setDepth(2);
        this.add.text(x, y-hH+36, `👥 ${capacity} seats`, {
            fontFamily:'Inter,sans-serif', fontSize:'11px', color:'#64748b',
        }).setOrigin(.5, 0).setDepth(2);

        addWall(this, wallGroup, x-hW-4, y-hH, 8, h);
        addWall(this, wallGroup, x+hW-4, y-hH, 8, h);
        addWall(this, wallGroup, x-hW, y-hH-4, w, 8);
        addWall(this, wallGroup, x-hW, y+hH-4, hW-doorW/2, 8);
        addWall(this, wallGroup, x+doorW/2, y+hH-4, hW-doorW/2, 8);

        const zone = this.add.rectangle(x, y, w+100, h+100, 0x000000, 0);
        zone._room = room;
        roomZones.push(zone);
    });

    /* ============== MY PLAYER ============== */
    const myCol = strToColor(ME.full_name);
    const pg = this.add.graphics();
    pg.fillStyle(myCol, 1); pg.fillCircle(0, 0, 22);
    pg.lineStyle(4, 0xffffff, 0.9); pg.strokeCircle(0, 0, 22);
    pg.fillStyle(myCol, 0.18); pg.fillCircle(0, 0, 34);

    const myEmoji = (ME.avatar_emoji && ME.avatar_emoji.includes('fa-')) ? '👤' : (ME.avatar_emoji || '😊');
    const em = this.add.text(0, 0, myEmoji, { fontSize:'22px' }).setOrigin(.5,.5);
    const playerCont = this.add.container(2300, 2800, [pg, em]).setDepth(12);

    phaserPlayer = this.physics.add.existing(playerCont);
    phaserPlayer.body.setCircle(22, -22, -22);
    phaserPlayer.body.setCollideWorldBounds(true);

    phaserPlayer._lbl = this.add.text(0, 0, ME.full_name + ' (You)', {
        fontFamily:'Inter,sans-serif', fontSize:'12px', fontStyle:'bold',
        color:'#fff', stroke:'#000', strokeThickness:4
    }).setOrigin(.5, 1).setDepth(13);

    this.physics.add.collider(phaserPlayer, wallGroup);

    /* ============== CAMERA ============== */
    this.cameras.main.startFollow(phaserPlayer, true, 0.1, 0.1);
    this.cameras.main.setZoom(window.innerWidth < 768 ? 0.35 : 0.85);
    this.cameras.main.setBounds(0, 0, 4600, 4600);

    /* ============== CONTROLS ============== */
    cursors = this.input.keyboard.createCursorKeys();
    wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        e: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
    };
    this.input.on('wheel', (ptr, obs, dx, dy) => {
        const z = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.0012, 0.3, 2.2);
        this.cameras.main.zoomTo(z, 80);
    });
    setupJoystick();
}

function addWall(scene, group, x, y, w, h) {
    const r = scene.add.rectangle(x + w/2, y + h/2, w, h, 0x000000, 0);
    scene.physics.add.existing(r, true);
    group.add(r);
}

/* ============== JOYSTICK ============== */
let joyOn = false, joyVec = {x:0, y:0};
function setupJoystick() {
    const base = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    const MAX = 32;
    let ox = 0, oy = 0;

    function startJoy(e, cX, cY) { e.preventDefault(); joyOn = true; const r = base.getBoundingClientRect(); ox = r.left+r.width/2; oy = r.top+r.height/2; moveJoy(cX, cY); }
    function handleMove(e, cX, cY) { if(!joyOn) return; e.preventDefault(); moveJoy(cX, cY); }
    function endJoy() { joyOn = false; joyVec = {x:0,y:0}; knob.style.transform = 'translate(-50%,-50%)'; }
    function moveJoy(cX, cY) {
        let dx = cX-ox, dy = cY-oy; const d = Math.sqrt(dx*dx+dy*dy);
        if (d>MAX) { dx=dx/d*MAX; dy=dy/d*MAX; }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        joyVec.x = dx/MAX; joyVec.y = dy/MAX;
    }

    base.addEventListener('touchstart', e => startJoy(e, e.touches[0].clientX, e.touches[0].clientY), {passive:false});
    base.addEventListener('touchmove', e => handleMove(e, e.touches[0].clientX, e.touches[0].clientY), {passive:false});
    base.addEventListener('touchend', endJoy);
    base.addEventListener('mousedown', e => startJoy(e, e.clientX, e.clientY));
    window.addEventListener('mousemove', e => handleMove(e, e.clientX, e.clientY));
    window.addEventListener('mouseup', endJoy);
}

/* ============== UPDATE LOOP ============== */
let _lastSentX = 0, _lastSentY = 0, _sendTimer = 0;

function sceneUpdate(time, delta) {
    if (phaserPlayer?._lbl) {
        phaserPlayer._lbl.setPosition(phaserPlayer.x, phaserPlayer.y - 44);
    }

    if (currentRoomId) {
        phaserPlayer.body.setVelocity(0, 0);
        return;
    }

    const SPD = 360;
    let vx = 0, vy = 0;
    if (cursors.left.isDown || wasd.left.isDown) vx = -SPD;
    else if (cursors.right.isDown || wasd.right.isDown) vx = SPD;
    if (cursors.up.isDown || wasd.up.isDown) vy = -SPD;
    else if (cursors.down.isDown || wasd.down.isDown) vy = SPD;
    if (joyOn) { vx = joyVec.x * SPD; vy = joyVec.y * SPD; }
    if (vx && vy && !joyOn) { vx *= 0.707; vy *= 0.707; }
    phaserPlayer.body.setVelocity(vx, vy);

    // Proximity check
    let found = false;
    for (const z of roomZones) {
        if (Math.abs(phaserPlayer.x - z.x) < z.width/2 && Math.abs(phaserPlayer.y - z.y) < z.height/2) {
            found = true; showPopup(z._room); break;
        }
    }
    if (!found && lastNearbyId) hidePopup();
    if (Phaser.Input.Keyboard.JustDown(wasd.e) && nearbyRoom) joinRoom(nearbyRoom);

    // Send position to server (throttled — every 100ms, only if moved)
    _sendTimer += delta;
    if (_sendTimer > 100) {
        _sendTimer = 0;
        const px = Math.round(phaserPlayer.x);
        const py = Math.round(phaserPlayer.y);
        if (px !== _lastSentX || py !== _lastSentY) {
            _lastSentX = px; _lastSentY = py;
            wsSend({ type: 'move', x: px, y: py });
        }
    }
}

/* ============== BOOT ============== */
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    const dinp = document.getElementById('d-inp');
    const minp = document.getElementById('m-inp');
    if (dinp) dinp.addEventListener('keypress', e => { if(e.key==='Enter') sendMsg(); });
    if (minp) minp.addEventListener('keypress', e => { if(e.key==='Enter') sendMsg('m'); });
});

/* ============== MOBILE TUTORIAL ============== */
function checkMobileTutorial() {
    if (window.innerWidth <= 768 && !localStorage.getItem('campus_tutorial_done')) {
        document.getElementById('mobile-tutorial-overlay').style.display = 'flex';
        const jh = document.createElement('div'); jh.className = 'tutorial-highlight-joystick'; jh.id = 'tut-joy-ring';
        document.body.appendChild(jh);
    }
}
window.nextTutorialStep = function() {
    document.getElementById('tutorial-step-1').style.display = 'none';
    document.getElementById('tutorial-step-2').style.display = 'block';
    const jr = document.getElementById('tut-joy-ring'); if (jr) jr.remove();
    const ch = document.createElement('div'); ch.className = 'tutorial-highlight-chat'; ch.id = 'tut-chat-ring';
    document.body.appendChild(ch);
}
window.finishTutorial = function() {
    document.getElementById('mobile-tutorial-overlay').style.display = 'none';
    const cr = document.getElementById('tut-chat-ring'); if (cr) cr.remove();
    localStorage.setItem('campus_tutorial_done', 'true');
}
document.addEventListener('DOMContentLoaded', () => { setTimeout(checkMobileTutorial, 1000); });