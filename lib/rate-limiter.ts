// 한투 API 초당 20회 제한 → 50ms 간격 큐
const INTERVAL_MS = 50;
const TIMEOUT_MS = 10_000;

let lastCall = 0;
const queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
let processing = false;

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const now = Date.now();
    const waitTime = Math.max(0, INTERVAL_MS - (now - lastCall));

    if (waitTime > 0) {
      await new Promise((r) => setTimeout(r, waitTime));
    }

    const item = queue.shift();
    if (item) {
      lastCall = Date.now();
      item.resolve();
    }
  }

  processing = false;
}

export async function acquireSlot(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = queue.findIndex((q) => q.resolve === resolve);
      if (idx >= 0) queue.splice(idx, 1);
      reject(new Error('Rate limit 큐 타임아웃 (10초)'));
    }, TIMEOUT_MS);

    queue.push({
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject,
    });

    processQueue();
  });
}
