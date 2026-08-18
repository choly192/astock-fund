export class RefreshQueue {
  private current: Promise<void> | undefined;
  private requested = false;

  constructor(private readonly task: () => Promise<void>) {}

  run(): Promise<void> {
    this.requested = true;
    if (!this.current) this.current = this.drain();
    return this.current;
  }

  private async drain(): Promise<void> {
    try {
      while (this.requested) {
        this.requested = false;
        await this.task();
      }
    } finally {
      this.current = undefined;
    }
  }
}
