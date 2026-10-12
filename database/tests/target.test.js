import test from 'node:test';
import assert from 'node:assert/strict';
import { describeTarget } from '../lib/connect.js';

test('describeTarget: connection strings whose hosts are all Atlas (*.mongodb.net) are atlas', () => {
  for (const u of ['mongodb+srv://u:p@c.mongodb.net', 'mongodb://u:p@ac-1.mongodb.net:27017,ac-2.mongodb.net:27017/?ssl=true']) assert.equal(describeTarget(u), 'atlas', u);
});
test('describeTarget: non-Atlas, mixed, look-alike and invalid strings are non-atlas; missing is unknown', () => {
  for (const u of ['mongodb://db.example.com:27017/', 'mongodb://db.example.com:1,ac-1.mongodb.net:1/', 'mongodb://mongodb.net.example.com/', 'mongodb+srv://c.mongodb.net.evil.com', 'mongodb://ac-1.mongodb.net.evil.com:27017', 'garbage']) assert.equal(describeTarget(u), 'non-atlas', u);
  assert.equal(describeTarget(''), 'unknown'); assert.equal(describeTarget(undefined), 'unknown');
});
