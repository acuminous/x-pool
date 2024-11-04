const { describe, it, beforeEach } = require('zunit');
const { deepStrictEqual: eq, fail, rejects } = require('node:assert');
const Bay = require('../lib/Bay');
const RequestFactory = require('../lib/queue/RequestFactory');
const RequestFacade = require('../lib/queue/RequestFacade');
const Events = require('../lib/Events');
const CreateCommand = require('../lib/commands/CreateCommand');
const DestroyCommand = require('../lib/commands/DestroyCommand');
const TestFactory = require('./lib/TestFactory')

const noop = () => {};

describe('Bay', () => {

  describe('reserve', () => {
    it('should transition the bay status to RESERVED', () => {
    	const bay = new Bay();
      const request = createRequest();
      bay.reserve(request);

      eq(bay.isReserved(), true);
    });
  });

  describe('provision', () => {
    it('should provision a resource for the bay', async () => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      await bay.reserve(request).provision();

      eq(bay.contains(1), true);
    });

    it('should transition the bay status to IDLE', async () => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      await bay.reserve(request).provision();

      eq(bay.isIdle(), true);
    });

    it('should emit the RESOURCE_CREATED event on success', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);

      bay.on(Events.RESOURCE_CREATED, done);
      await bay.provision();
    });

		it('should emit the RESOURCE_CREATION_ERROR event on success', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1, createError: 'Oh Noes!'}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);

      bay.on(Events.RESOURCE_CREATION_ERROR, (err) => {
      	eq(err.message, 'Oh Noes!');
      	done();
      });
      await rejects(() => bay.provision());
    });
  });

  describe('acquire', () => {
    it('should acquire the an idle resource if one has been provisioned', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);
      await bay.provision();

      bay.on(Events.RESOURCE_CREATED, () => {
      	fail('A resource should not have been created');
      });

      const resource = await bay.acquire();
      eq(resource, 1);

      setTimeout(done, 100);
    });

    it('should create a resource if one has not been provisioned', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);

      bay.on(Events.RESOURCE_CREATED, done);
      const resource = await bay.acquire();
      eq(resource, 1);
    });

    it('should transition the bay status to BUSY', async () => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);

      await bay.acquire();

      eq(bay.isBusy(), true);
    });

    it('should tolerate attempts to acquire aborted resources', async () => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      request.queue();
      bay.reserve(request);

      request.abort();

      await bay.acquire();

      eq(bay.isBusy(), true);
    });
  });

  describe('release', () => {
    it('should transition the bay status to IDLE', async () => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);

      await bay.acquire();
      await bay.release();

      eq(bay.isIdle(), true);
    });

    it('should emit the RESOURCE_RELEASED event on success', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);

      await bay.acquire();

      bay.on(Events.RESOURCE_RELEASED, (done));
      await bay.release();
    });
  });

  describe('destroy', () => {
    it('should transition the bay status to DESTROYING when resource was not provisioned', async () => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);
      await bay.destroy(noop);

      eq(bay.isDestroying(), true);
    });

    it('should transition the bay status to DESTROYING when resource was provisioned', async () => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);
      await bay.provision();
      await bay.destroy(noop);

      eq(bay.isDestroying(), true);
    });

    it('should not emit the RESOURCE_DESTROYED event when a resource was not provisioned', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);

      bay.on(Events.RESOURCE_DESTROYED, () => {
      	fail('Event should not have been emitted');
      });

      await bay.destroy(noop);

      setTimeout(done, 100);
    });

    it('should emit the RESOURCE_DESTROYED event when a resource was provisioned', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);
      await bay.provision();

      bay.on(Events.RESOURCE_DESTROYED, (done));
      await bay.destroy(noop);
    });

    it('should execute the onEventualSuccess callback after destroying the resource when a resource was not provisioned', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);

      await bay.destroy(done);
    });

    it('should execute the onEventualSuccess callback after destroying the resource when a resource was provisioned', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);
      await bay.provision();

      await bay.destroy(done);
    });

    it('should wait for inflight resource creation to complete before destroying', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1, createDelay: 100}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);

      let created = false;
      bay.on(Events.RESOURCE_CREATED, () => {
      	created = true;
      });
      bay.on(Events.RESOURCE_DESTROYED, () => {
      	eq(created, true);
      	done();
      });

      bay.provision();

      await bay.destroy(noop);
    });
  });

  describe('segregate', () => {
    it('should transition the bay status to SEGREGATED', () => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      bay.segregate();

      eq(bay.isSegregated(), true);
    });

    it('should emit the RESOURCE_SEGREGATED event', async (t, done) => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });

      bay.on(Events.RESOURCE_SEGREGATED, done);
      bay.segregate();
    });
  });

  describe('evict', () => {
    it('should emit RESOURCE_EVICTED event', (t, done) => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });

      bay.once(Events.RESOURCE_EVICTED, done);
      bay.evict();
    });
  });

  describe('isInitialising', () => {
    it('should return true if status is EMPTY, RESERVED, or CREATING', async () => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });

      eq(bay.isInitialising(), true);

      const request = createRequest();
      bay.reserve(request);
      eq(bay.isInitialising(), true);

      await bay.provision();
      eq(bay.isInitialising(), false);
    });
  });

  describe('contains', () => {
    it('should return true if the bay contains the specified resource', async () => {
    	const factory = new TestFactory([{ resource: 1}])
    	const bay = createBay({ factory });
      const request = createRequest();
      bay.reserve(request);

      const resource = await bay.acquire();

      eq(bay.contains(resource), true);
    });

    it('should return false if the bay does not contain the specified resource', () => {
    	const factory = new TestFactory()
    	const bay = createBay({ factory });

      eq(bay.contains('DOES_NOT_EXIST'), false);
    });
  });
});


function createBay({ factory }) {
	const commands = {
    create: new CreateCommand(null, factory, 1000),
    destroy: new DestroyCommand(null, factory, 1000),
  }
  return new Bay('B1', commands);
}

function createRequest() {
  const factory = new RequestFactory([], []);
  return new RequestFacade(1, () => {}, factory);
}
