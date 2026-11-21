/**
 * Tín hiệu dừng dùng chung cho mọi worker.
 * sleep() sẽ trả về ngay khi stop() được gọi, nhờ đó Ctrl+C không phải chờ
 * hết các khoảng nghỉ dài.
 */
export class StopSignal {
  constructor() {
    this.stopped = false;
    this.sleepers = new Set();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const wake of [...this.sleepers]) wake();
    this.sleepers.clear();
  }

  sleep(ms) {
    if (this.stopped || !Number.isFinite(ms) || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        this.sleepers.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      this.sleepers.add(wake);
    });
  }
}
