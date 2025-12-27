const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const DATA_FILE = path.join(__dirname, 'envelopes.json');
const wss = new WebSocket.Server({ port: 8080 });

// In-memory envelopes store (loaded from file)
let envelopes = [];

function loadEnvelopes() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      envelopes = JSON.parse(raw || '[]');
      console.log('Loaded envelopes from', DATA_FILE);
    }
  } catch (e) {
    console.error('Failed to load envelopes:', e.message);
    envelopes = [];
  }
}

function saveEnvelopes() {
  try {
    fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(envelopes, null, 2), 'utf8');
    fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
  } catch (e) {
    console.error('Failed to save envelopes:', e.message);
  }
}

function broadcast(obj, wsExclude) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach(c => {
    if (c !== wsExclude && c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  });
}

loadEnvelopes();

console.log('WebSocket server listening on ws://0.0.0.0:8080');

wss.on('connection', (ws) => {
  // send current state
  ws.send(JSON.stringify({ type: 'init', envelopes }));

  ws.on('message', (data) => {
    let msg = null;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }

    if (msg.type === 'add') {
      // server creates canonical envelope object
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const env = {
        id,
        type: msg.envelopeType || 'money',
        amount: null,
        wish: null,
        sender: msg.sender || 'Người dùng',
        opened: false,
        openedBy: null,
        receivedAmount: null,
        receivedWish: null,
        timestamp: new Date().toLocaleString('vi-VN')
      };

      if (env.type === 'money') {
        const provided = parseInt(msg.content);
        if (!isNaN(provided) && provided > 0) {
          env.amount = provided;
        } else {
          env.amount = Math.floor(Math.random() * 490) + 10; // 10-499k
        }
      } else {
        env.wish = msg.content || '';
      }

      envelopes.push(env);
      saveEnvelopes();
      broadcast({ type: 'add', envelope: env });
    }

    if (msg.type === 'open') {
      const id = msg.id;
      const receiver = msg.openedBy || msg.receiver || 'Unknown';
      const env = envelopes.find(e => e.id === id);
      if (env && !env.opened && env.sender !== receiver) {
        env.opened = true;
        env.openedBy = receiver;
        if (env.type === 'money') env.receivedAmount = env.amount;
        else env.receivedWish = env.wish;
        saveEnvelopes();
        broadcast({ type: 'open', envelope: env });
      }
    }
  });
});
