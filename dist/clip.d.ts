import { type TNoteEventStage } from "./event-types.ts";
export interface IClip<TEventData> {
    id: string;
    startInTransportBeats: number;
    endInTransportBeats: number;
    activeRangeStartBeatTime: number;
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
