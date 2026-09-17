import test from 'node:test';
import assert from 'node:assert/strict';
import { listOrders } from '../src/orders.js';

test('lists all orders', () => assert.equal(listOrders().length, 5));
test('filters by status', () => assert.deepEqual(listOrders({status:'PENDING'}).map(x=>x.id), ['o2']));
