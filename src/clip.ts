import { type TNoteEventStage } from "./event-types.ts";

export interface IClip<TEventData> {
  id: string;
  startInTransportBeats: number; // relative to transport i.e. "when does this clip start playing?"
  endInTransportBeats: number;
  activeRangeStartBeatTime: number; // relative to clip i.e. "when in clip to start playing from" like Live start marker
  activeRangeEndBeatTime: number;
  shouldLoop: boolean;
  events: IClipEvent<TEventData>[];
}

export interface IClipEvent<TEventData> {
  noteId: string;
  stage: TNoteEventStage;
  beatTime: number;
  data: TEventData;
}
