import test from 'node:test';
import assert from 'node:assert/strict';
import { describeTarget } from '../lib/connect.js';

test('describeTarget: only all-loopback connection strings are local', () => {
  for (const u of ['mongodb://127.0.0.1:5000/', 'mongodb://localhost:27017', 'mongodb://[::1]:27017/x', 'mongodb://u:p@127.0.0.1:1/']) assert.equal(describeTarget(u), 'local', u);
});
test('describeTarget: Atlas-style, SRV, mixed, look-alike and invalid strings are remote', () => {
  for (const u of ['mongodb+srv://u:p@c.mongodb.net', 'mongodb://u:p@ac-1.mongodb.net:27017,ac-2.mongodb.net:27017/?ssl=true', 'mongodb://127.0.0.1:1,evil.example:1/', 'mongodb://localhost.evil.com/', '', 'garbage', undefined]) assert.equal(describeTarget(u), 'remote', String(u));
});
