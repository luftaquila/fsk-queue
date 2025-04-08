import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import express from 'express'
import pinoHttp from 'pino-http';
import { JSONFilePreset } from 'lowdb/node';

const pwd = path.resolve();
const db = {
  main: await JSONFilePreset(path.join(pwd, 'db-queue.json'), {
    battery: { type: 'battery', name: '배터리', length: 0, active: false },
    electric: { type: 'electric', name: '전기', length: 0, active: false },
    chassis: { type: 'chassis', name: '섀시', length: 0, active: false },
    tilting: { type: 'tilting', name: '틸팅', length: 0, active: false },
    braking: { type: 'braking', name: '제동', length: 0, active: false },
    noise: { type: 'noise', name: '소음', length: 0, active: false },
    rain: { type: 'rain', name: '우천', length: 0, active: false },
  }),
  current: await JSONFilePreset(path.join(pwd, 'db-current.json'), {}),
  battery: await JSONFilePreset(path.join(pwd, 'db-battery.json'), []),
  electric: await JSONFilePreset(path.join(pwd, 'db-electric.json'), []),
  chassis: await JSONFilePreset(path.join(pwd, 'db-chassis.json'), []),
  tilting: await JSONFilePreset(path.join(pwd, 'db-tilting.json'), []),
  braking: await JSONFilePreset(path.join(pwd, 'db-braking.json'), []),
  noise: await JSONFilePreset(path.join(pwd, 'db-noise.json'), []),
  rain: await JSONFilePreset(path.join(pwd, 'db-rain.json'), []),
};

await db.main.read();

const app = express();
app.use(express.json());
app.use(express.static(path.join(pwd, 'web')));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  if (req.headers.authorization) {
    req.headers.authuser = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('utf-8').split(':')[0];
  }
  next();
});
app.use(pinoHttp({ stream: fs.createWriteStream('./app.log', { flags: 'a' }) }));

app.listen(6000);

// return active inspections
app.get('/active', async (req, res) => {
  await db.main.read();
  res.json(Object.entries(db.main.data).filter(([_, v]) => v.active).map(([_, v]) => v));
});

// return inspection queue state
app.get('/state/:num', async (req, res) => {
  let num = Number(req.params.num);

  let entries = await get_entry();

  if (req.params.num === '' || Number.isNaN(num) || num < 0 || entries[num] === undefined) {
    return res.status(400).send('엔트리 번호가 올바르지 않습니다.');
  }

  await db.current.read();

  let current = db.current.data[num];

  if (current) {
    await db[current].read();

    for (let i = 0; i < db[current].data.length; i++) {
      if (db[current].data[i].num === num) {
        if (db[current].data[i].phone != req.query.phone) {
          return res.status(400).send('전화번호가 일치하지 않습니다.');
        }

        return res.json({
          queue: db.main.data[current].name,
          rank: i + 1,
        });
      }
    }

    return res.json({ queue: undefined, rank: -1 });
  } else {
    return res.json({ queue: undefined, rank: -1 });
  }
});

// return all inspections
app.get('/admin/all', async (req, res) => {
  await db.main.read();
  res.json(Object.entries(db.main.data).map(([_, v]) => v));
});

// return inspection queue
app.get('/admin/:type', async (req, res) => {
  if (!db[req.params.type]) {
    return res.status(400).send('올바르지 않은 대기열입니다');
  }

  await db[req.params.type].read();
  res.json(db[req.params.type].data);
});

// toggle inspection active state
app.post('/admin/:type', async (req, res) => {
  if (!db[req.params.type]) {
    return res.status(400).send('올바르지 않은 대기열입니다');
  }

  await db.main.read();
  db.main.data[req.params.type].active = req.body.active === true;
  await db.main.write();

  res.status(201).send();
});

// delete entry
app.delete('/admin/:type', async (req, res) => {
  let num = Number(req.body.num);

  if (!db[req.params.type]) {
    return res.status(400).send('올바르지 않은 대기열입니다');
  }

  if (req.body.num === '' || Number.isNaN(num) || num < 0) {
    return res.status(400).send('엔트리 번호가 올바르지 않습니다.');
  }

  await db[req.params.type].read();

  let prev_3rd = db[req.params.type].data[2];

  db[req.params.type].data = db[req.params.type].data.filter(x => x.num !== num);
  await db[req.params.type].write();

  res.status(200).send();

  await db.current.read();

  if (db.current.data[num]) {
    delete db.current.data[num];
    await db.current.write();

    await db.main.read();
    db.main.data[req.params.type].length = db[req.params.type].data.length;
    await db.main.write();
  }

  // send SMS to third waiter
  if (process.env.NAVER_CLOUD_ACCESS_KEY && process.env.NAVER_CLOUD_SECRET_KEY &&
      process.env.NAVER_CLOUD_SMS_SERVICE_ID && process.env.PHONE_NUMBER_SMS_SENDER) {
    let target = db[req.params.type].data[2];

    if (target && target.num !== prev_3rd.num) {
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

      let sms = https.request(payload, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(data);
        });
      });

      sms.on('error', e => console.error(e));

      sms.write(JSON.stringify({
        type: 'SMS',
        from: process.env.PHONE_NUMBER_SMS_SENDER,
        content: `FSK ${new Date().getFullYear()} ${db.main.data[req.params.type].name} 검차 입장 대기 3번째 순서입니다. 차량과 함께 검차장에서 대기해 주세요.`,
        messages: [{ to: target.phone }]
      }));
      sms.end();
    }
  }
});

// enqueue new entry
app.post('/register/:type', async (req, res) => {
  let num = Number(req.body.num);

  if (!db[req.params.type]) {
    return res.status(400).send('존재하지 않는 대기열입니다.');
  }

  let entries = await get_entry();

  if (req.body.num === '' || Number.isNaN(num) || num < 0 || entries[num] === undefined) {
    return res.status(400).send('엔트리 번호가 올바르지 않습니다.');
  }

  if (!/^010\d{8}$/.test(req.body.phone)) {
    return res.status(400).send('전화번호가 올바르지 않습니다.');
  }

  await db.main.read();

  if (!db.main.data[req.params.type].active) {
    return res.status(400).send('대기열이 비활성화 상태입니다.');
  }

  await db.current.read();

  if (db.current.data[num]) {
    return res.status(400).send(`이미 ${db.main.data[db.current.data[num]].name} 대기열에 등록된 엔트리입니다.`);
  }

  await db[req.params.type].read();
  db[req.params.type].data.push({ num, phone: req.body.phone });
  await db[req.params.type].write();

  db.main.data[req.params.type].length = db[req.params.type].data.length;
  await db.main.write();

  db.current.data[num] = req.params.type;
  await db.current.write();

  res.status(201).send();
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
