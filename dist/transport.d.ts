import { type ITransportEvent } from "./event-types.ts";
import { Clock } from "./clock.ts";
export declare const TransportState: {
    readonly Stopped: "Stopped";
    readonly Running: "Running";
    readonly Starting: "Starting";
};
export type TTransportState = (typeof TransportState)[keyof typeof TransportState];
export type TTransportListener = (e: ITransportEvent) => void;
export declare class Transport {
    private tempo;
    private nextBeatTime;
    private nextContextTime;
    private contextTimeWhenTransportStarted;
    private state;
    private listener;
    private clock;
    private lastTransportPlaybackEvent?;
    constructor(clock: Clock, listener: TTransportListener);
    get currentBeatTime(): number;
    cleanup(): void;
    setTempo(t: number): void;
    getTempo(): number;
    getState(): TTransportState;
    start(): void;
    stop(): void;
    private onClock;
    private getCurrentBeatTime;
    private getBeatTimeForAudioContextTime;
}
