export type TTickCallback = (lookaheadInSeconds: number) => void;
export declare class Clock {
    private stableTickWorker;
    audioContext: AudioContext;
    private lookaheadTimeInSeconds;
    private lastObservedAudioCtxTimeInSeconds;
    private callbacks;
    private workerBlobUrl;
    constructor(audioContext: AudioContext);
    addListener(cb: TTickCallback): void;
    removeListener(cb: TTickCallback): void;
    private onTick;
    cleanup(): void;
}
