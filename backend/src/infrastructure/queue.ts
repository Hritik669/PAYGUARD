import { Queue } from "bullmq";
import { createBullConnection } from "./redis";

export const WEBHOOK_QUEUE = "webhooks";

let queue: Queue | null = null;

export function getWebhookQueue(): Queue {
  if (!queue) {
    queue = new Queue(WEBHOOK_QUEUE, {
      connection: createBullConnection(),
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }
  return queue;
}

export async function closeQueues(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
