import {
  EventType,
  type ITransportEvent,
  type ITransportPlaybackEvent,
} from "./event-types.ts";
import { Clock } from "./clock.ts";

const DEFAULT_TEMPO = 120;
const DEFAULT_BEAT_TIME_INCREMENT = 1 / 4 / 2 / 2;
// We can't tell a transport to start *now*, because
// we need a bit of delay to ensure that events can
// be scheduled in advance.
const TRANSPORT_OFFSET_TIME_SECONDS = 0.25;

export const TransportState = {
  Stopped: "Stopped",
  Running: "Running",
  Starting: "Starting",
} as const;
export type TTransportState =
  (typeof TransportState)[keyof typeof TransportState];

export type TTransportListener = (e: ITransportEvent) => void;

export class Transport {
  private tempo: number = DEFAULT_TEMPO;

  // These variables provides a mapping from
  // audioContext.currentTime to transport "beat time".
  // These are always updated in tandem on each clock tick.
  private nextBeatTime = 0;
  private nextContextTime = 0;
  // This variable specifies the current time of the audio
  // context that corresponds to when the transport started
  // playback. See TRANSPORT_OFFSET_TIME_SECONDS above
  // for why this is needed.
  private contextTimeWhenTransportStarted = 0;

  private state: TTransportState = TransportState.Stopped;
  private listener: TTransportListener;
  private clock: Clock;

  private lastTransportPlaybackEvent?: ITransportPlaybackEvent;

  constructor(clock: Clock, listener: TTransportListener) {
    this.clock = clock;
    this.listener = listener;
    this.onClock = this.onClock.bind(this);
    clock.addListener(this.onClock);
  }

  get currentBeatTime() {
    if (!this.lastTransportPlaybackEvent) return 0;
    return this.getCurrentBeatTime(this.lastTransportPlaybackEvent);
  }

  public cleanup() {
    this.stop();
    this.clock.removeListener(this.onClock);
  }

  public setTempo(t: number) {
    this.tempo = t;
  }

  public getTempo() {
    return this.tempo;
  }

  public getState() {
    return this.state;
  }

  public start(): void {
    if (
      this.state !== TransportState.Running &&
      this.state !== TransportState.Starting
    ) {
      this.state = TransportState.Starting;
    }
  }

  public stop(): void {
    if (this.state === TransportState.Stopped) {
      return;
    }
    this.state = TransportState.Stopped;
    this.listener({ type: EventType.TransportStop });
  }

  private onClock(lookaheadInSeconds: number): void {
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

    while (
      this.nextContextTime <
      this.clock.audioContext.currentTime + lookaheadInSeconds
    ) {
      const transportEvent = {
        type: EventType.TransportPlayback,
        nextBeatTime: this.nextBeatTime,
        nextContextTime: this.nextContextTime,
        tempo: this.tempo,
      } as ITransportPlaybackEvent;
      this.listener(transportEvent);
      this.lastTransportPlaybackEvent = transportEvent;
      this.nextBeatTime += DEFAULT_BEAT_TIME_INCREMENT;
      this.nextContextTime += contextTimeIncrement;
    }
  }

  private getCurrentBeatTime(e: ITransportPlaybackEvent) {
    if (this.state === TransportState.Running) {
      return this.getBeatTimeForAudioContextTime(
        e,
        this.clock.audioContext.currentTime,
      );
    } else {
      return 0;
    }
  }

  private getBeatTimeForAudioContextTime(
    e: ITransportPlaybackEvent,
    contextTime: number,
  ) {
    if (contextTime < this.contextTimeWhenTransportStarted) {
      return 0;
    }

    const nextContextTime = e.nextContextTime;
    const deltaContextTime = nextContextTime - contextTime;
    const deltaInBeats = deltaContextTime / (60 / e.tempo);
    return e.nextBeatTime - deltaInBeats;
  }
}
