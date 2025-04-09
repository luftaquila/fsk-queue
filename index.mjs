import fs from 'fs';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import express from 'express'
import pinoHttp from 'pino-http';
import Database from 'better-sqlite3';

const inspections = {
  battery: '배터리',
  electric: '전기',
  chassis: '섀시',
  tilting: '틸팅',
  braking: '제동',
  noise: '소음',
  rain: '우천'
};

// init db
const db = new Database('./data/queue.db');

db.transaction(() => {
  db.exec(`CREATE TABLE IF NOT EXISTS inspection (
    type TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    length INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS current (
    num INTEGER PRIMARY KEY,
    phone TEXT NOT NULL,
    inspection TEXT NOT NULL
  );`);

  for (const [k, v] of Object.entries(inspections)) {
    db.prepare(`INSERT OR IGNORE INTO inspection (type, name) VALUES (?, ?)`).run(k, v);
    db.exec(`CREATE TABLE IF NOT EXISTS ${k} (
      num INTEGER PRIMARY KEY,
      phone TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );`);
  }

  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`);

  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`).run('sms', 'FALSE');

  if (!process.env.NAVER_CLOUD_ACCESS_KEY ||
    !process.env.NAVER_CLOUD_SECRET_KEY ||
    !process.env.NAVER_CLOUD_SMS_SERVICE_ID ||
    !process.env.PHONE_NUMBER_SMS_SENDER) {
    db.prepare(`UPDATE settings SET value = ? WHERE key = ?`).run('FALSE', 'sms');
  }
})();

process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));

const app = express();
app.use(express.json());
app.use(express.static('./web'));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  if (req.headers.authorization) {
    req.headers.authuser = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('utf-8').split(':')[0];
  }
  next();
});
app.use(pinoHttp({ stream: fs.createWriteStream('./data/queue.log', { flags: 'a' }) }));

app.listen(6000);

// return active inspections
app.get('/active', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM inspection WHERE active = TRUE').all());
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// return inspection queue state
app.get('/state/:num', async (req, res) => {
  const num = Number(req.params.num);

  try {
    const entries = await get_entry();

    if (req.params.num === '' || Number.isNaN(num) || num < 0 || entries[num] === undefined) {
      return res.status(400).send('엔트리 번호가 올바르지 않습니다.');
    }
  } catch (e) {
    return res.status(500).send(`엔트리를 조회할 수 없습니다. ${e}`);
  }

  try {
    const entry = db.prepare('SELECT * FROM current WHERE num = ?').get(num);

    if (!entry) {
      return res.json({ queue: undefined, rank: -1 });
    }

    if (entry.phone !== req.query.phone) {
      return res.status(400).send('전화번호가 일치하지 않습니다.');
    }

    const rank = db.prepare(`SELECT COUNT(*) AS rank FROM ${entry.inspection} WHERE timestamp <= (SELECT timestamp FROM ${entry.inspection} WHERE num = ?)`).get(num).rank;

    res.json({ queue: inspections[entry.inspection], rank: rank });
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// return all inspections
app.get('/admin/all', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM inspection').all());
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// return inspection queue
app.get('/admin/:type', (req, res) => {
  try {
    res.json(db.prepare(`SELECT * FROM ${req.params.type} ORDER BY timestamp ASC`).all());
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// toggle inspection active state
app.patch('/admin/:type', (req, res) => {
  try {
    db.prepare('UPDATE inspection SET active = ? WHERE type = ?').run(req.body.active === true ? 1 : 0, req.params.type);
    res.status(200).send();
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// enqueue new entry
app.post('/register/:type', async (req, res) => {
  if (!/^010\d{8}$/.test(req.body.phone)) {
    return res.status(400).send('전화번호가 올바르지 않습니다.');
  }

  const num = Number(req.body.num);

  try {
    const entries = await get_entry();

    if (req.body.num === '' || Number.isNaN(num) || num < 0 || entries[num] === undefined) {
      return res.status(400).send('엔트리 번호가 올바르지 않습니다.');
    }
  } catch (e) {
    return res.status(500).send(`엔트리를 조회할 수 없습니다. ${e}`);
  }

  try {
    db.transaction(() => {
      const current = db.prepare('SELECT * FROM current WHERE num = ?').get(num);

      if (current) {
        return res.status(400).send(`이미 ${inspections[current.inspection]} 검차에 등록된 엔트리입니다.`);
      }

      if (!db.prepare('SELECT active FROM inspection WHERE type = ?').get(req.params.type).active) {
        return res.status(400).send('대기열이 비활성화 상태입니다.');
      }

      db.prepare('INSERT INTO current (num, phone, inspection) VALUES (?, ?, ?)').run(num, req.body.phone, req.params.type);
      db.prepare(`INSERT INTO ${req.params.type} (num, phone, timestamp) VALUES (?, ?, ?)`).run(num, req.body.phone, Date.now());
      db.prepare('UPDATE inspection SET length = length + 1 WHERE type = ?').run(req.params.type);
    })();
    res.status(201).send();
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// delete entry
app.delete('/admin/:type', (req, res) => {
  const num = Number(req.body.num);

  if (req.body.num === '' || Number.isNaN(num) || num < 0) {
    return res.status(400).send('엔트리 번호가 올바르지 않습니다.');
  }

  const prev = db.prepare(`SELECT * FROM ${req.params.type} ORDER BY timestamp ASC LIMIT 1 OFFSET 2`).get();

  try {
    let ok = true;

    db.transaction(() => {
      const ret = db.prepare(`DELETE FROM ${req.params.type} WHERE num = ?`).run(num);

      if (!ret.changes) {
        ok = false;
        return;
      }

      db.prepare('UPDATE inspection SET length = length - 1 WHERE type = ?').run(req.params.type);
      db.prepare('DELETE FROM current WHERE num = ?').run(num);
    })();

    if (!ok) {
      return res.status(400).send('존재하지 않는 엔트리입니다.');
    }

    res.status(200).send();
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }

  // send SMS to third waiter
  let target = undefined;

  try {
    if (db.prepare(`SELECT value FROM settings WHERE key = 'sms'`).get().value !== 'TRUE') {
      return;
    }

    target = db.prepare(`SELECT * FROM ${req.params.type} ORDER BY timestamp ASC LIMIT 1 OFFSET 2`).get();
  } catch (e) {
    return console.error(`DB 오류: ${e}`);
  }

  if (target && target.num !== prev.num) {
    let payload = {
      hostname: 'sens.apigw.ntruss.com',
      port: 443,
      path: `/sms/v2/services/${process.env.NAVER_CLOUD_SMS_SERVICE_ID}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-ncp-apigw-timestamp': Date.now(),
        'x-ncp-iam-access-key': process.env.NAVER_CLOUD_ACCESS_KEY,
        'x-ncp-apigw-signature-v2': ''
      }
    };

    let secret = crypto.createHmac('sha256', process.env.NAVER_CLOUD_SECRET_KEY)
      .update(`${payload.method} ${payload.path}\n${payload.headers['x-ncp-apigw-timestamp']}\n${process.env.NAVER_CLOUD_ACCESS_KEY}`)
      .digest('base64');

    payload.headers['x-ncp-apigw-signature-v2'] = secret;

    const sms = https.request(payload, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => console.log(data));
    });

    sms.on('error', e => console.error(e));
    sms.write(JSON.stringify({
      type: 'SMS',
      from: process.env.PHONE_NUMBER_SMS_SENDER,
      content: `[FSK ${new Date().getFullYear()}]\n엔트리 ${target.num}번 ${inspections[req.params.type]} 검차 대기 순서 3번입니다.\n차량과 함께 검차장으로 오세요.`,
      messages: [{ to: target.phone }]
    }));
    sms.end();
  }
});

// get sms configuration
app.get('/settings/sms', (req, res) => {
  try {
    const sms = db.prepare('SELECT value FROM settings WHERE key = ?').get('sms');
    res.json({ value: sms.value === 'TRUE' });
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// update sms configuration
app.patch('/settings/sms', (req, res) => {
  try {
    if (req.body.value === true) {
      if (!process.env.NAVER_CLOUD_ACCESS_KEY ||
        !process.env.NAVER_CLOUD_SECRET_KEY ||
        !process.env.NAVER_CLOUD_SMS_SERVICE_ID ||
        !process.env.PHONE_NUMBER_SMS_SENDER) {
        return res.status(400).send('SMS 환경 변수가 설정되지 않았습니다.');
      }
    }

    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(req.body.value === true ? 'TRUE' : 'FALSE', 'sms');
    res.status(200).send();
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

async function get_entry() {
  return await new Promise((resolve, reject) => {
    http.get('http://fsk-entry:5000/all', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        }
        catch (e) {
          reject(e);
        }
      });
      res.on('error', e => reject(e));
    }).on('error', e => reject(e));
  });
}
