import { scheduler } from "node:timers/promises";
import { Pool, Operations } from "../../";
import ExampleFactory from "./ExampleFactory";

(async () => {
  const pool = new Pool({ factory: new ExampleFactory(), maxSize: 2, acquireTimeout: 500, destroyTimeout: 500 });
  let running = true;

  pool.on(Operations.DestroyResourceOperation.FAILED, () => {
    pool.evictBadResources();
  }).on("X-POOL_EVENT", ({ code, message, err }) => {
    if (err) console.log(code, message, err);
    else console.log(code, message);
  });

  process.once('SIGINT', async () => {
    running = false;
    await pool.shutdown();
  })

  console.log("Press CTRL+C to quit");

  const executors = Array(20).fill(null).map(async () => {
    while (running) {
      await pool.with(async (resource) => {
        console.log(resource);
        await scheduler.wait(100);
      });
    }
  });

  await Promise.all(executors);
})();
