import { type TUniqueIdentifier } from "./uuid.ts";
export type TEvent = INoteEvent | IStopAllNotesEvent | ITransportEvent | ICancelNoteEvent;
interface IBaseEvent {
    type: TEventType;
}
export declare const EventType: {
    readonly Note: "Note";
    readonly TransportPlayback: "TransportPlayback";
    readonly TransportStop: "TransportStop";
    readonly StopAllNotes: "StopAllNotes";
    readonly CancelNote: "CancelNote";
};
export type TEventType = (typeof EventType)[keyof typeof EventType];
export declare const NoteEventStage: {
    readonly Start: 0;
    readonly End: 1;
    readonly InstantaneousStartEnd: 2;
    readonly Update: 3;
};
export type TNoteEventStage = (typeof NoteEventStage)[keyof typeof NoteEventStage];
export interface INoteEvent extends IBaseEvent {
    type: "Note";
    noteId: TUniqueIdentifier;
    stage: TNoteEventStage;
    audioContextTime: number;
    transportTime?: number;
    index?: number;
    frequency?: number;
    velocity?: number;
}
export interface IStopAllNotesEvent extends IBaseEvent {
    type: "StopAllNotes";
    audioContextTime?: number;
}
export interface ICancelNoteEvent extends IBaseEvent {
    type: "CancelNote";
    audioContextTime?: number;
    noteId: TUniqueIdentifier;
}
export interface ITransportPlaybackEvent extends IBaseEvent {
    type: "TransportPlayback";
    nextBeatTime: number;
    nextContextTime: number;
    tempo: number;
}
export interface ITransportStopEvent extends IBaseEvent {
    type: "TransportStop";
}
export type ITransportEvent = ITransportPlaybackEvent | ITransportStopEvent;
export {};
