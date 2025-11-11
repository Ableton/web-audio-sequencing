export type TTickCallback = (lookaheadInSeconds: number) => void;

const DEFAULT_CLOCK_TICK_INTERVAL_MS = 10;
const DEFAULT_CLOCK_LOOKAHEAD_MS = 250;

export class Clock {
  private stableTickWorker: Worker;
  public audioContext: AudioContext;
  private lookaheadTimeInSeconds: number;
  private lastObservedAudioCtxTimeInSeconds: number;
  private callbacks: Set<TTickCallback> = new Set();
  private workerBlobUrl: string;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.lookaheadTimeInSeconds = DEFAULT_CLOCK_LOOKAHEAD_MS / 1000;
    console.assert(
      this.lookaheadTimeInSeconds * 1000 > DEFAULT_CLOCK_TICK_INTERVAL_MS,
    );

    const workerBlob = new Blob(
      [
        /* javascript */ `
            // the initial timeout time
            let timerId;
            let intervalTimeInMs = ${DEFAULT_CLOCK_TICK_INTERVAL_MS};
            self.onmessage = function(msg) {
                switch (msg.data.command) {
                    case "start": timerId = this.setInterval(onTick, intervalTimeInMs); break;
                    case "stop": this.clearInterval(timerId); break;
                }
            };
            function onTick() {
                postMessage("tick");
            }`,
      ],
      { type: "text/javascript" },
    );

    this.workerBlobUrl = URL.createObjectURL(workerBlob);
    this.stableTickWorker = new Worker(this.workerBlobUrl);
    this.stableTickWorker.onmessage = this.onTick.bind(this);
    this.stableTickWorker.postMessage({ command: "start" });
    this.lastObservedAudioCtxTimeInSeconds = this.audioContext.currentTime;
  }

  public addListener(cb: TTickCallback): void {
    this.callbacks.add(cb);
  }

  public removeListener(cb: TTickCallback): void {
    this.callbacks.delete(cb);
  }

  // This function is called every DEFAULT_CLOCK_TICK_INTERVAL_MS milliseconds
  // from a web worker. The only real point of this function is to periodically
  // tell downstream schedulers that they are now allowed to schedule all pending
  // events up to audioContext.currentTime + lookaheadTimeInSeconds. In other words,
  // the clock is very simple and exists only to provide a stable callback.
  private onTick(): void {
    if (this.audioContext.state === "running") {
      const currentTimeInSeconds = this.audioContext.currentTime;
      const deltaTimeInSeconds =
        currentTimeInSeconds - this.lastObservedAudioCtxTimeInSeconds;
      this.lastObservedAudioCtxTimeInSeconds = currentTimeInSeconds;

      // TODO: This could be adaptive. If we're going over time a lot,
      // we could adjust the lookahead value (and potentially the interval too).
      // We could add in some code to settle on a reasonable steady state with
      // acceptable ratio of ticks to over-time failures.
      if (deltaTimeInSeconds > this.lookaheadTimeInSeconds) {
        console.warn("scheduler went overtime");
      }

      this.callbacks.forEach((cb) => {
        cb(this.lookaheadTimeInSeconds);
      });
    }
  }

  public cleanup() {
    this.stableTickWorker.postMessage({ command: "stop" });
    this.stableTickWorker.terminate();
    this.callbacks.clear();
    URL.revokeObjectURL(this.workerBlobUrl);
  }
}
