import { type TUniqueIdentifier } from "./uuid.ts";

export type TEvent =
  | INoteEvent
  | IStopAllNotesEvent
  | ITransportEvent
  | ICancelNoteEvent;

interface IBaseEvent {
  type: TEventType;
}

export const EventType = {
  Note: "Note",
  TransportPlayback: "TransportPlayback",
  TransportStop: "TransportStop",
  StopAllNotes: "StopAllNotes",
  CancelNote: "CancelNote",
} as const;

export type TEventType = (typeof EventType)[keyof typeof EventType];

export const NoteEventStage = {
  Start: 0,
  End: 1,
  InstantaneousStartEnd: 2,
  Update: 3,
} as const;

export type TNoteEventStage =
  (typeof NoteEventStage)[keyof typeof NoteEventStage];

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
