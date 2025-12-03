// Простой express + ws сервер. Служит только для статических файлов и сигналинга.
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// Отдаём папку public как корень
app.use(express.static(path.join(__dirname, 'public')));

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