import { NoteEventStage } from "./event-types.js";
import { uuid } from "./uuid.js";
export class NoteProcessor {
    constructor() {
        this.map = new Map();
    }
    process(noteId, stage, metadata) {
        switch (stage) {
            case NoteEventStage.InstantaneousStartEnd:
                return { idForScheduling: uuid() };
            case NoteEventStage.Start: {
                const mapping = { idForScheduling: uuid(), metadata };
                this.map.set(noteId, mapping);
                return mapping;
            }
            case NoteEventStage.Update: {
                const mapping = this.map.get(noteId);
                return mapping;
            }
            case NoteEventStage.End: {
                const mapping = this.map.get(noteId);
                if (mapping === undefined) {
                    throw new Error(`processing end before start of ${noteId}`);
                }
                this.map.delete(noteId);
                return mapping;
            }
        }
    }
    getInfo(noteId) {
        return this.map.get(noteId);
    }
    playingNoteIds() {
        return new Set(this.map.keys());
    }
}
