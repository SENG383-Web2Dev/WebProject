import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

describe('GET /api/health', () => {
  it('should return 200 OK with status ok and timestamp', async () => {
    const response = await request(app).get('/api/health');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
    assert.equal(typeof response.body.uptime, 'number');
    assert.ok(response.body.timestamp);
  });
});
