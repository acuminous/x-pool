import { scheduler } from "node:timers/promises";
import { Pool, Errors } from "../../";
import ExampleFactory from "./ExampleFactory";

(async () => {
  const pool = new Pool({ factory: new ExampleFactory(), maxSize: 2, acquireTimeout: 500, destroyTimeout: 500 });
  let running = true;

  pool.on(Errors.XPoolError.code, (err) => {
    console.error(err);
  });

  process.once('SIGINT', async () => {
    running = false;
    await pool.shutdown();
  })

  console.log("Press CTRL+C to quit");

  const executors = Array(3).fill(null).map(async () => {
    while (running) {
      await pool.with(async (resource) => {
        console.log(resource);
        await scheduler.wait(100);
      });
    }
  });

  await Promise.all(executors);
})();
