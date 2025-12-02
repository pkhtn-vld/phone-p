// Простой express + ws сервер. Служит только для статических файлов и сигналинга.
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });


// Отдаём папку public как корень
app.use(express.static(path.join(__dirname, 'public')));


// простой endpoint health
app.get('/ping', (req, res) => res.send('ok'));

app.get('/get-turn-credentials', async (req, res) => {
  const domain = process.env.METERED_DOMAIN;
  const secret = process.env.METERED_SECRET;
  if (!domain || !secret) return res.status(500).json({ error: 'TURN config not available' });

  try {
    // Пример: POST к API провайдера, где Authorization содержит SECRET.
    // Точный URL/тело/заголовки — смотрите доки metered.live / вашего провайдера.
    const apiUrl = `https://api.${domain}/v1/credentials`; // <- пример, заменить
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ttl: 3600 }) // пример: просим креды на час
    });
    const body = await r.json();
    // body должен содержать iceServers или username/credential
    res.json(body);
  } catch (err) {
    console.error('get-turn error', err);
    res.status(502).json({ error: 'failed to get turn credentials' });
  }
});

// // comment: добавить endpoint для приёма логов от клиента (debug)
app.post('/debug/log', express.json(), (req, res) => {
  // comment: принимаем произвольный JSON лог от клиента и просто пишем в консоль
  try {
    const body = req.body;
    // comment: защита — не выводим слишком длинные поле 'data', укоротим при необходимости
    const safe = JSON.stringify(body, (k, v) => {
      if (typeof v === 'string' && v.length > 1000) return v.slice(0, 1000) + '...';
      return v;
    });
    console.log('// debug-log', safe);
  } catch (e) {
    console.log('// debug-log parse error', String(e));
  }
  // comment: всегда отвечает 204 — чтобы клиент не падал при сетевых ошибках
  res.status(204).end();
});


// кастомный upgrade, под WebSocket path /ws
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});


// храним клиентов в Set
const clients = new Set();


wss.on('connection', (ws) => {
  // даём клиенту краткий id
  ws._id = Math.random().toString(36).slice(2, 9);
  clients.add(ws);
  console.log('// ws: connect', ws._id);


  ws.send(JSON.stringify({ type: 'welcome', id: ws._id }));


  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }


    // логирование на сервере
    console.log('// ws: recv', ws._id, msg.type || '(no-type)');


    // простая пересылка сообщения всем остальным клиентам
    // в msg можно передать поля from/to — клиент сам их добавляет
    for (const c of clients) {
      if (c === ws) continue;
      try { c.send(JSON.stringify(msg)); } catch (e) { /* ignore */ }
    }
  });


  ws.on('close', () => {
    clients.delete(ws);
    console.log('// ws: close', ws._id);
  });


  ws.on('error', (e) => console.warn('// ws: error', ws._id, e && e.message));
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));