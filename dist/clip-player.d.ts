import { type ITransportEvent } from "./event-types.ts";
import { NoteProcessor } from "./note-processor.ts";
import { type TUniqueIdentifier } from "./uuid.ts";
import type { IClip, IClipEvent } from "./clip.ts";
interface IClipAndPlaybackData<TEventData> {
    clip: IClip<TEventData>;
    noteProcessor: NoteProcessor;
    eventsForActiveRange: IClipEvent<TEventData>[];
}
type TClipPlayerCallback<TEventData> = (audioContextTime: number, transportTime: number, clipId: TUniqueIdentifier, event: IClipEvent<TEventData>) => void;
export declare class ClipPlayer<TEventData> {
    private clipsWithPlaybackData;
    private callback;
    private lastTransportPlaybackEvent;
    private schedulingWindowLeadingEdgeInTransportBeats;
    private schedulingWindowTrailingEdgeInTransportBeats;
    private shouldWrapCorrespondingEndEventsAroundActiveRange;
    constructor(callback: TClipPlayerCallback<TEventData>, shouldWrapEndEventsInActiveRange?: boolean);
    addClip(c: IClip<TEventData>): void;
    getAllClips(): Map<string, IClipAndPlaybackData<TEventData>>;
    removeClip(id: string): void;
    removeAllClips(): void;
    updateClip(c: IClip<TEventData>): void;
    getClip(id: string): IClip<TEventData> | undefined;
    scheduleEndEventsForAllCurrentlyPlayingClips(): void;
    private scheduleEndEventsForCurrentlyPlayingNotesInClip;
    private scheduleEndEventsForClipUpdate;
    private scheduleEndEventsForNotes;
    onTransportEvent(e: ITransportEvent): void;
    private transportBeatTimeToUnrolledClipBeatTime;
    transportBeatTimeToClipBeatTime(clip: IClip<TEventData>, transportBeatTime: number): number;
    private clipBeatTimeToTransportBeatTime;
    private getEventsForActiveRange;
    private handleClipPlayback;
    private scheduleEventForPlayback;
    private getLoopStartEndBeatTimes;
    private isClipEventInActiveRange;
    private isTransportBeatTimeInSchedulingWindow;
}
export {};
