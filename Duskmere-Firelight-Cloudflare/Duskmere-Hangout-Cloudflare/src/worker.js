const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 8;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 8; attempt++) {
        let room = '';
        for (let i = 0; i < 6; i++) room += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        const id = env.ROOMS.idFromName(room);
        const stub = env.ROOMS.get(id);
        const init = await stub.fetch('https://room.internal/init', { method: 'POST', body: room });
        if (init.status === 201) return Response.json({ room });
      }
      return Response.json({ error: 'Could not create a room. Please retry.' }, { status: 503 });
    }
    if (url.pathname === '/ws') {
      const room = (url.searchParams.get('room') || '').toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(room)) return new Response('Invalid room code.', { status: 400 });
      const id = env.ROOMS.idFromName(room);
      return env.ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

export class Room {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (await this.ctx.storage.get('room')) return new Response('Exists', { status: 409 });
      const code = await request.text();
      await this.ctx.storage.put('room', { code, host: null, chessFen: null, ended: false });
      return new Response('Created', { status: 201 });
    }
    const room = await this.ctx.storage.get('room');
    if (!room || room.ended) return new Response('Room not found or already closed.', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket upgrade required.', { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ joined: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    let data;
    try { data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); }
    catch { return this.send(ws, { type: 'error', message: 'Could not read that message.' }); }
    let room = await this.ctx.storage.get('room');
    if (!room || room.ended) return this.send(ws, { type: 'error', message: 'This room has ended.' });
    let p = ws.deserializeAttachment() || { joined: false };
    if (!p.joined) {
      if (data.type !== 'join') return this.send(ws, { type: 'error', message: 'Join the room first.' });
      await this.join(ws, p, data, room);
      return;
    }

    if (data.type === 'chat') {
      const text = String(data.text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
      if (text) await this.broadcast({ type: 'chat', id: p.id, name: p.name, text }, ws);
    } else if (data.type === 'avatar') {
      p.avatar = this.cleanAvatar(data.avatar); ws.serializeAttachment(p);
      await this.broadcast({ type: 'avatar', id: p.id, avatar: p.avatar }, ws);
    } else if (data.type === 'move') {
      const x = Number(data.x), z = Number(data.z);
      if (Number.isFinite(x) && Number.isFinite(z)) await this.broadcast({ type: 'move', id: p.id,
        x: Math.max(-18, Math.min(18, x)), z: Math.max(-18, Math.min(18, z)), emote: String(data.emote || '').slice(0, 16) }, ws);
    } else if (data.type === 'voice') {
      p.voice = !!data.enabled; ws.serializeAttachment(p);
      await this.broadcast({ type: 'players', players: await this.players() });
    } else if (data.type === 'signal') {
      const target = this.findSocket(data.to);
      if (target) await this.send(target, { type: 'signal', from: p.id, description: data.description, candidate: data.candidate });
    } else if (data.type === 'chessMove') {
      if (p.color !== 'white' && p.color !== 'black') return;
      room.chessFen = typeof data.fen === 'string' ? data.fen.slice(0, 200) : room.chessFen;
      await this.ctx.storage.put('room', room);
      await this.broadcast({ type: 'chessMove', from: p.id, move: data.move, fen: room.chessFen });
    } else if (data.type === 'chessReset' && p.id === room.host) {
      room.chessFen = null; await this.ctx.storage.put('room', room);
      await this.broadcast({ type: 'chessReset' });
    }
  }

  async join(ws, attachment, data, room) {
    const others = await this.players();
    if (others.length >= MAX_PLAYERS) return this.send(ws, { type: 'error', message: 'This room is full (8 friends maximum).' });
    const id = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    const name = String(data.name || 'Friend').replace(/\s+/g, ' ').trim().slice(0, 18) || 'Friend';
    const color = room.host === null ? 'white' : (others.some(p => p.color === 'black') ? 'spectator' : 'black');
    const p = { joined: true, id, name, color, avatar: this.cleanAvatar(data.avatar), voice: false };
    if (room.host === null) room.host = id;
    await this.ctx.storage.put('room', room);
    ws.serializeAttachment(p);
    const players = [...others, p];
    await this.send(ws, { type: 'welcome', id, room: room.code, host: id === room.host,
      players, chessFen: room.chessFen, iceServers: this.iceServers() });
    await this.broadcast({ type: 'players', players }, ws);
  }

  async players() {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      try { const p = ws.deserializeAttachment(); if (p && p.joined) out.push({ id:p.id, name:p.name, color:p.color, avatar:p.avatar, voice:!!p.voice }); }
      catch {}
    }
    return out;
  }

  findSocket(id) {
    if (!id) return null;
    for (const ws of this.ctx.getWebSockets()) {
      try { const p = ws.deserializeAttachment(); if (p && p.joined && p.id === id) return ws; }
      catch {}
    }
    return null;
  }

  async send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  async broadcast(obj, exclude = null) {
    await Promise.all(this.ctx.getWebSockets().map(ws => {
      if (ws === exclude) return Promise.resolve();
      return this.send(ws, obj);
    }));
  }

  cleanAvatar(a) {
    if (!a || typeof a !== 'object') a = {};
    const color = (k, d) => /^#[0-9a-fA-F]{6}$/.test(String(a[k] || '')) ? a[k] : d;
    return { coat:color('coat','#8f6ad8'), hair:color('hair','#342719'), skin:color('skin','#e0a97f') };
  }

  iceServers() {
    const out = [{ urls:'stun:stun.l.google.com:19302' }];
    if (this.env.TURN_URL) out.push({ urls:this.env.TURN_URL, username:this.env.TURN_USERNAME || '', credential:this.env.TURN_CREDENTIAL || '' });
    return out;
  }

  async webSocketClose(ws) {
    const p = ws.deserializeAttachment();
    if (!p || !p.joined) return;
    const room = await this.ctx.storage.get('room');
    if (!room) return;
    if (p.id === room.host) {
      room.ended = true; await this.ctx.storage.put('room', room);
      await this.broadcast({ type:'hostLeft' }, ws);
      for (const other of this.ctx.getWebSockets()) if (other !== ws) { try { other.close(1001, 'Host left'); } catch {} }
    } else {
      await this.broadcast({ type:'players', players:await this.players() }, ws);
    }
  }

  async webSocketError(ws) { try { ws.close(1011, 'Connection error'); } catch {} }
}
