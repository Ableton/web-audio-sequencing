const DEFAULT_CLOCK_TICK_INTERVAL_MS = 10;
const DEFAULT_CLOCK_LOOKAHEAD_MS = 250;
export class Clock {
    constructor(audioContext) {
        this.callbacks = new Set();
        this.audioContext = audioContext;
        this.lookaheadTimeInSeconds = DEFAULT_CLOCK_LOOKAHEAD_MS / 1000;
        console.assert(this.lookaheadTimeInSeconds * 1000 > DEFAULT_CLOCK_TICK_INTERVAL_MS);
        const workerBlob = new Blob([
            `
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
        ], { type: "text/javascript" });
        this.workerBlobUrl = URL.createObjectURL(workerBlob);
        this.stableTickWorker = new Worker(this.workerBlobUrl);
        this.stableTickWorker.onmessage = this.onTick.bind(this);
        this.stableTickWorker.postMessage({ command: "start" });
        this.lastObservedAudioCtxTimeInSeconds = this.audioContext.currentTime;
    }
    addListener(cb) {
        this.callbacks.add(cb);
    }
    removeListener(cb) {
        this.callbacks.delete(cb);
    }
    onTick() {
        if (this.audioContext.state === "running") {
            const currentTimeInSeconds = this.audioContext.currentTime;
            const deltaTimeInSeconds = currentTimeInSeconds - this.lastObservedAudioCtxTimeInSeconds;
            this.lastObservedAudioCtxTimeInSeconds = currentTimeInSeconds;
            if (deltaTimeInSeconds > this.lookaheadTimeInSeconds) {
                console.warn("scheduler went overtime");
            }
            this.callbacks.forEach((cb) => {
                cb(this.lookaheadTimeInSeconds);
            });
        }
    }
    cleanup() {
        this.stableTickWorker.postMessage({ command: "stop" });
        this.stableTickWorker.terminate();
        this.callbacks.clear();
        URL.revokeObjectURL(this.workerBlobUrl);
    }
}
