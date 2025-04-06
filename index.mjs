import fs from 'fs';
import path from 'path';
import express from 'express'
import pinoHttp from 'pino-http';
import { JSONFilePreset } from 'lowdb/node';

const pwd = path.resolve();
const db = {
  log: await JSONFilePreset(path.join(pwd, 'db-log.json'), []),
};

const web = path.join(pwd, 'web');

const app = express();

app.use(express.json());
app.use(express.static(web));
app.use(express.urlencoded({ extended: true }));
app.use(pinoHttp({ stream: fs.createWriteStream('./app.log', { flags: 'a' }) }));

app.listen(7000);
