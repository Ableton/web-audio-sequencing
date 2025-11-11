import { type TNoteEventStage } from "./event-types.ts";
import { type TUniqueIdentifier } from "./uuid.ts";
export type NoteMetaData = Partial<{
    noteNumber: number;
}> | undefined;
export interface IScheduledNoteInfo {
    idForScheduling: TUniqueIdentifier;
    metadata?: NoteMetaData;
}
export declare class NoteProcessor {
    private map;
    process(noteId: TUniqueIdentifier, stage: TNoteEventStage, metadata?: NoteMetaData): IScheduledNoteInfo | undefined;
    getInfo(noteId: TUniqueIdentifier): IScheduledNoteInfo | undefined;
    playingNoteIds(): Set<TUniqueIdentifier>;
}
