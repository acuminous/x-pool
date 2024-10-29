const { describe, it } = require('zunit');
const { deepStrictEqual: eq } = require('node:assert');

const QueueStats = require('../lib/QueueStats');

describe('QueueStats', () => {

  describe('isDrained', () => {
    it('should return true when queue is empty', () => {
      const stats = new QueueStats();
      eq(stats.isDrained(), true);
    });

    it('should return false when there are queued items', () => {
      const stats = new QueueStats();
      stats.queued();
      eq(stats.isDrained(), false);
    });
  });

  describe('queued', () => {
    it('should increment queued count', () => {
      const stats = new QueueStats();
      stats.queued();
      eq(stats.toJSON(), { queued: 1, dispatched: 0 });
    });
  });

  describe('dispatched', () => {
    it('should decrement queued and increment dispatched', () => {
      const stats = new QueueStats();
      stats.queued();
      stats.dispatched();
      eq(stats.toJSON(), { queued: 0, dispatched: 1 });
    });
  });

  describe('requeued', () => {
    it('should increment queued and decrement dispatched', () => {
      const stats = new QueueStats();
      stats.queued();
      stats.dispatched();
      stats.requeued();
      eq(stats.toJSON(), { queued: 1, dispatched: 0 });
    });
  });

  describe('removedFromQueued', () => {
    it('should decrement queued count', () => {
      const stats = new QueueStats();
      stats.queued();
      stats.removedFromQueued();
      eq(stats.toJSON(), { queued: 0, dispatched: 0 });
    });
  });

  describe('removedFromDispatched', () => {
    it('should decrement dispatched count', () => {
      const stats = new QueueStats();
      stats.queued();
      stats.dispatched();
      stats.removedFromDispatched();
      eq(stats.toJSON(), { queued: 0, dispatched: 0 });
    });
  });

  describe('toJSON', () => {
    it('should report the queued and dispatched counts', () => {
      const stats = new QueueStats();
      stats.queued();
      stats.queued();
      stats.dispatched();
      eq(stats.toJSON(), { queued: 1, dispatched: 1 });
    });
  });

});
