import { describe, it, expect } from "vitest";
import { NoteEventStage } from "./event-types.ts";
import { NoteProcessor } from "./note-processor.ts";

describe("note-processor", () => {
  it("note-processor-simple", () => {
    const noteProcessor = new NoteProcessor();
    const info = noteProcessor.process("a", NoteEventStage.Start);
    expect(info).toEqual(noteProcessor.process("a", NoteEventStage.End));
  });

  it("note-processor-produces-new-ids", () => {
    const noteProcessor = new NoteProcessor();
    const infoA = noteProcessor.process("a", NoteEventStage.Start);
    expect(infoA).toEqual(noteProcessor.process("a", NoteEventStage.End));

    const infoB = noteProcessor.process("a", NoteEventStage.Start);
    expect(infoB).toEqual(noteProcessor.process("a", NoteEventStage.End));

    expect(infoA.idForScheduling).not.toEqual(infoB.idForScheduling);
  });

  it("note-processor-playing-note-ids", () => {
    const noteProcessor = new NoteProcessor();
    noteProcessor.process("a", NoteEventStage.Start);
    noteProcessor.process("b", NoteEventStage.Start);
    noteProcessor.process("c", NoteEventStage.Start);

    expect(noteProcessor.playingNoteIds()).toEqual(new Set(["a", "b", "c"]));

    noteProcessor.process("a", NoteEventStage.End);

    expect(noteProcessor.playingNoteIds()).toEqual(new Set(["b", "c"]));

    noteProcessor.process("c", NoteEventStage.End);

    expect(noteProcessor.playingNoteIds()).toEqual(new Set(["b"]));

    noteProcessor.process("b", NoteEventStage.End);

    expect(noteProcessor.playingNoteIds()).toEqual(new Set());
  });
});
