import { NoteEventStage, type TNoteEventStage } from "./event-types.ts";
import { uuid, type TUniqueIdentifier } from "./uuid.ts";

/* There are some common tasks which can be handled 
   by this utility/helper:

   * Every time a note is played, it needs to be assigned a
     new unique note identifier. This is because each played note
     is something like a new instantiation of a note that exists
     in some data source like a piano roll. If a
     piano roll doesn't loop, this isn't so important,
     but it's crucially important if you consider something like a
     looping section of a piano roll that might eventually be
     recorded: Every note in each loop iteration needs to be unique,
     even if it's coming from the same "source". To avoid needing to 
     write this note-assignment logic ad-hoc, this object
     can be used to trivially assign ids properly.

   * It's handy to know which notes in a source are currently
     playing/scheduled.
*/

export type NoteMetaData = Partial<{ noteNumber: number }> | undefined;
export interface IScheduledNoteInfo {
  idForScheduling: TUniqueIdentifier;
  metadata?: NoteMetaData;
}

export class NoteProcessor {
  private map: Map<TUniqueIdentifier, IScheduledNoteInfo> = new Map();

  public process(
    noteId: TUniqueIdentifier,
    stage: TNoteEventStage,
    metadata?: NoteMetaData,
  ): IScheduledNoteInfo | undefined {
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

  public getInfo(noteId: TUniqueIdentifier): IScheduledNoteInfo | undefined {
    return this.map.get(noteId);
  }

  public playingNoteIds(): Set<TUniqueIdentifier> {
    return new Set(this.map.keys());
  }
}
