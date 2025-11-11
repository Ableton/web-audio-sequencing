import { EventType, } from "./event-types.js";
const DEFAULT_TEMPO = 120;
const DEFAULT_BEAT_TIME_INCREMENT = 1 / 4 / 2 / 2;
const TRANSPORT_OFFSET_TIME_SECONDS = 0.25;
export const TransportState = {
    Stopped: "Stopped",
    Running: "Running",
    Starting: "Starting",
};
export class Transport {
    constructor(clock, listener) {
        this.tempo = DEFAULT_TEMPO;
        this.nextBeatTime = 0;
        this.nextContextTime = 0;
        this.contextTimeWhenTransportStarted = 0;
        this.state = TransportState.Stopped;
        this.clock = clock;
        this.listener = listener;
        this.onClock = this.onClock.bind(this);
        clock.addListener(this.onClock);
    }
    get currentBeatTime() {
        if (!this.lastTransportPlaybackEvent)
            return 0;
        return this.getCurrentBeatTime(this.lastTransportPlaybackEvent);
    }
    cleanup() {
        this.stop();
        this.clock.removeListener(this.onClock);
    }
    setTempo(t) {
        this.tempo = t;
    }
    getTempo() {
        return this.tempo;
    }
    getState() {
        return this.state;
    }
    start() {
        if (this.state !== TransportState.Running &&
            this.state !== TransportState.Starting) {
            this.state = TransportState.Starting;
        }
    }
    stop() {
        if (this.state === TransportState.Stopped) {
            return;
        }
        this.state = TransportState.Stopped;
        this.listener({ type: EventType.TransportStop });
    }
    onClock(lookaheadInSeconds) {
        if (this.state === TransportState.Stopped) {
            return;
        }
        if (this.state === TransportState.Starting) {
            this.contextTimeWhenTransportStarted =
                this.clock.audioContext.currentTime +
                    (this.clock.audioContext.currentTime >= TRANSPORT_OFFSET_TIME_SECONDS
                        ? 0
                        : TRANSPORT_OFFSET_TIME_SECONDS);
            this.nextContextTime = this.contextTimeWhenTransportStarted;
            this.nextBeatTime = 0;
            this.state = TransportState.Running;
        }
        const tempoMultiplier = 60 / this.tempo;
        const contextTimeIncrement = tempoMultiplier * DEFAULT_BEAT_TIME_INCREMENT;
        while (this.nextContextTime <
            this.clock.audioContext.currentTime + lookaheadInSeconds) {
            const transportEvent = {
                type: EventType.TransportPlayback,
                nextBeatTime: this.nextBeatTime,
                nextContextTime: this.nextContextTime,
                tempo: this.tempo,
            };
            this.listener(transportEvent);
            this.lastTransportPlaybackEvent = transportEvent;
            this.nextBeatTime += DEFAULT_BEAT_TIME_INCREMENT;
            this.nextContextTime += contextTimeIncrement;
        }
    }
    getCurrentBeatTime(e) {
        if (this.state === TransportState.Running) {
            return this.getBeatTimeForAudioContextTime(e, this.clock.audioContext.currentTime);
        }
        else {
            return 0;
        }
    }
    getBeatTimeForAudioContextTime(e, contextTime) {
        if (contextTime < this.contextTimeWhenTransportStarted) {
            return 0;
        }
        const nextContextTime = e.nextContextTime;
        const deltaContextTime = nextContextTime - contextTime;
        const deltaInBeats = deltaContextTime / (60 / e.tempo);
        return e.nextBeatTime - deltaInBeats;
    }
}
