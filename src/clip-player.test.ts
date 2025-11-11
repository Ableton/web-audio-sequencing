import { describe, it, expect } from "vitest";
import { EventType, NoteEventStage } from "./event-types.ts";
import { type IClipEvent } from "./clip.ts";
import { ClipPlayer } from "./clip-player.ts";
import { type TUniqueIdentifier } from "./uuid.ts";

const CLIP_A = {
  id: "a",
  startInTransportBeats: 0,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 0,
  activeRangeEndBeatTime: 4,
  shouldLoop: true,
  events: [],
};

const DUMMY_CALLBACK = (
  _audioContextTime: number,
  __transportTime: number,
  __clipId: TUniqueIdentifier,
  ___event: IClipEvent<unknown>,
) => { };

describe("clip-player", () => {
  it("creating-a-clip-player", () => {
    new ClipPlayer<unknown>(DUMMY_CALLBACK);
  });

  it("adding-and-removing-a-clip", () => {
    const clipPlayer = new ClipPlayer<unknown>(DUMMY_CALLBACK);
    clipPlayer.addClip(CLIP_A);
    clipPlayer.removeClip("a");
  });

  it("adding-clip-with-same-id-throws", () => {
    const clipPlayer = new ClipPlayer<unknown>(DUMMY_CALLBACK);
    clipPlayer.addClip(CLIP_A);
    expect(() => {
      clipPlayer.addClip(CLIP_A);
    }).toThrow();
  });

  it("unlooped-clip-playback", () => {
    const callbackResults: {
      audioContextTime: number;
      transportTime: number;
      clipId: string;
      event: IClipEvent<unknown>;
    }[] = [];

    function callback(
      audioContextTime: number,
      transportTime: number,
      clipId: TUniqueIdentifier,
      event: IClipEvent<unknown>,
    ) {
      callbackResults.push({ audioContextTime, transportTime, clipId, event });
    }

    const clipPlayer = new ClipPlayer<unknown>(callback);
    clipPlayer.addClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 4,
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 4,
      shouldLoop: false,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 0,
          data: {},
        },
        { noteId: "note_a", stage: NoteEventStage.End, beatTime: 4, data: {} },
      ],
    });

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 0,
      nextContextTime: 0,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(0);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 1,
      nextContextTime: 1,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    const noteStart = callbackResults[0];
    expect(noteStart.audioContextTime).toBe(0);
    expect(noteStart.transportTime).toBe(0);
    expect(noteStart.clipId).toBe("a");
    expect(noteStart.event.stage).toBe(NoteEventStage.Start);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 2,
      nextContextTime: 2,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 3,
      nextContextTime: 3,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 4,
      nextContextTime: 4,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 5,
      nextContextTime: 5,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(2);

    const noteEnd = callbackResults[1];
    expect(noteEnd.audioContextTime).toBe(4);
    expect(noteEnd.transportTime).toBe(4);
    expect(noteEnd.clipId).toBe("a");
    expect(noteEnd.event.stage).toBe(NoteEventStage.End);

    expect(noteStart.event.noteId).toBe(noteEnd.event.noteId);
  });

  it("looped-clip-playback", () => {
    const callbackResults: {
      audioContextTime: number;
      transportTime: number;
      clipId: string;
      event: IClipEvent<unknown>;
    }[] = [];

    function callback(
      audioContextTime: number,
      transportTime: number,
      clipId: TUniqueIdentifier,
      event: IClipEvent<unknown>,
    ) {
      callbackResults.push({ audioContextTime, transportTime, clipId, event });
    }

    const clipPlayer = new ClipPlayer<unknown>(callback);
    clipPlayer.addClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 4,
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 4,
      shouldLoop: true,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 0,
          data: {},
        },
        { noteId: "note_a", stage: NoteEventStage.End, beatTime: 4, data: {} },
      ],
    });

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 0,
      nextContextTime: 0,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(0);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 1,
      nextContextTime: 1,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    const noteStartLoop1 = callbackResults[0];
    expect(noteStartLoop1.audioContextTime).toBe(0);
    expect(noteStartLoop1.transportTime).toBe(0);
    expect(noteStartLoop1.clipId).toBe("a");
    expect(noteStartLoop1.event.stage).toBe(NoteEventStage.Start);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 2,
      nextContextTime: 2,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 3,
      nextContextTime: 3,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 4,
      nextContextTime: 4,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 5,
      nextContextTime: 5,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(3);

    const noteEndLoop1 = callbackResults[1];
    expect(noteEndLoop1.audioContextTime).toBe(4);
    expect(noteEndLoop1.transportTime).toBe(4);
    expect(noteEndLoop1.clipId).toBe("a");
    expect(noteEndLoop1.event.stage).toBe(NoteEventStage.End);

    const noteStartLoop2 = callbackResults[2];
    expect(noteStartLoop2.audioContextTime).toBe(4);
    expect(noteStartLoop2.transportTime).toBe(4);
    expect(noteStartLoop2.clipId).toBe("a");
    expect(noteStartLoop2.event.stage).toBe(NoteEventStage.Start);

    expect(noteStartLoop1.event.noteId).toBe(noteEndLoop1.event.noteId);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 6,
      nextContextTime: 6,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(3);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 7,
      nextContextTime: 7,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(3);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 8,
      nextContextTime: 8,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(3);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 9,
      nextContextTime: 9,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(5);

    const noteEndLoop2 = callbackResults[3];
    expect(noteEndLoop2.audioContextTime).toBe(8);
    expect(noteEndLoop2.transportTime).toBe(8);
    expect(noteEndLoop2.clipId).toBe("a");
    expect(noteEndLoop2.event.stage).toBe(NoteEventStage.End);

    expect(noteStartLoop1.event.noteId).not.toBe(noteStartLoop2.event.noteId);
  });

  it("transport-stop-causes-notes-to-end", () => {
    const callbackResults: {
      audioContextTime: number;
      transportTime: number;
      clipId: string;
      event: IClipEvent<unknown>;
    }[] = [];

    function callback(
      audioContextTime: number,
      transportTime: number,
      clipId: TUniqueIdentifier,
      event: IClipEvent<unknown>,
    ) {
      callbackResults.push({ audioContextTime, transportTime, clipId, event });
    }

    const clipPlayer = new ClipPlayer<unknown>(callback);
    clipPlayer.addClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 4,
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 4,
      shouldLoop: false,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 0,
          data: {},
        },
        { noteId: "note_a", stage: NoteEventStage.End, beatTime: 4, data: {} },
      ],
    });

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 0,
      nextContextTime: 0,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(0);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 1,
      nextContextTime: 1,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    const noteStart = callbackResults[0];
    expect(noteStart.audioContextTime).toBe(0);
    expect(noteStart.transportTime).toBe(0);
    expect(noteStart.clipId).toBe("a");
    expect(noteStart.event.stage).toBe(NoteEventStage.Start);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 2,
      nextContextTime: 2,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    clipPlayer.onTransportEvent({ type: EventType.TransportStop });
    expect(callbackResults.length).toBe(2);

    const noteEnd = callbackResults[1];
    expect(noteEnd.audioContextTime).toBe(2);
    expect(noteEnd.transportTime).toBe(2);
    expect(noteEnd.clipId).toBe("a");
    expect(noteEnd.event.stage).toBe(NoteEventStage.End);

    expect(noteStart.event.noteId).toBe(noteEnd.event.noteId);
  });

  it("updating-clip-causes-shifted-notes-to-stop", () => {
    const callbackResults: {
      audioContextTime: number;
      transportTime: number;
      clipId: string;
      event: IClipEvent<unknown>;
    }[] = [];

    function callback(
      audioContextTime: number,
      transportTime: number,
      clipId: TUniqueIdentifier,
      event: IClipEvent<unknown>,
    ) {
      callbackResults.push({ audioContextTime, transportTime, clipId, event });
    }

    const clipPlayer = new ClipPlayer<unknown>(callback);
    clipPlayer.addClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 4,
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 4,
      shouldLoop: false,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 1,
          data: {},
        },
        { noteId: "note_a", stage: NoteEventStage.End, beatTime: 3, data: {} },
      ],
    });

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 0,
      nextContextTime: 0,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(0);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 2,
      nextContextTime: 2,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    const noteStart = callbackResults[0];
    expect(noteStart.audioContextTime).toBe(1);
    expect(noteStart.transportTime).toBe(1);
    expect(noteStart.clipId).toBe("a");
    expect(noteStart.event.stage).toBe(NoteEventStage.Start);

    clipPlayer.updateClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 4,
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 4,
      shouldLoop: false,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 1 + 2,
          data: {},
        }, // Shift note to right of "playhead".
        {
          noteId: "note_a",
          stage: NoteEventStage.End,
          beatTime: 3 + 2,
          data: {},
        },
      ], // Shift note to right of "playhead".
    });

    expect(callbackResults.length).toBe(2);

    const noteEnd = callbackResults[1];
    expect(noteEnd.clipId).toBe("a");
    expect(noteEnd.event.stage).toBe(NoteEventStage.End);

    expect(noteStart.event.noteId).toBe(noteEnd.event.noteId);
  });

  it("updating-clip-causes-shifted-notes-to-stop-2", () => {
    const callbackResults: {
      audioContextTime: number;
      transportTime: number;
      clipId: string;
      event: IClipEvent<unknown>;
    }[] = [];

    function callback(
      audioContextTime: number,
      transportTime: number,
      clipId: TUniqueIdentifier,
      event: IClipEvent<unknown>,
    ) {
      callbackResults.push({
        audioContextTime,
        transportTime,
        clipId,
        event,
      });
    }

    const clipPlayer = new ClipPlayer<unknown>(callback);
    clipPlayer.addClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 4,
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 4,
      shouldLoop: false,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 1,
          data: {},
        },
        {
          noteId: "note_a",
          stage: NoteEventStage.End,
          beatTime: 3,
          data: {},
        },
      ],
    });

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 0,
      nextContextTime: 0,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(0);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 2,
      nextContextTime: 2,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    const noteStart = callbackResults[0];
    expect(noteStart.audioContextTime).toBe(1);
    expect(noteStart.transportTime).toBe(1);
    expect(noteStart.clipId).toBe("a");
    expect(noteStart.event.stage).toBe(NoteEventStage.Start);

    clipPlayer.updateClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 4,
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 4,
      shouldLoop: false,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 1 - 2,
          data: {},
        }, // Shift note to left of "playhead".
        {
          noteId: "note_a",
          stage: NoteEventStage.End,
          beatTime: 3 - 2,
          data: {},
        },
      ], // Shift note to left of "playhead".
    });

    expect(callbackResults.length).toBe(2);

    const noteEnd = callbackResults[1];
    expect(noteEnd.clipId).toBe("a");
    expect(noteEnd.event.stage).toBe(NoteEventStage.End);

    expect(noteStart.event.noteId).toBe(noteEnd.event.noteId);
  });

  it("updating-clip-causes-shifted-notes-to-stop-3", () => {
    const callbackResults: {
      audioContextTime: number;
      transportTime: number;
      clipId: string;
      event: IClipEvent<unknown>;
    }[] = [];

    function callback(
      audioContextTime: number,
      transportTime: number,
      clipId: TUniqueIdentifier,
      event: IClipEvent<unknown>,
    ) {
      callbackResults.push({ audioContextTime, transportTime, clipId, event });
    }

    const clipPlayer = new ClipPlayer<unknown>(callback);
    clipPlayer.addClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 4,
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 4,
      shouldLoop: false,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 1,
          data: {},
        },
        { noteId: "note_a", stage: NoteEventStage.End, beatTime: 3, data: {} },
      ],
    });

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 0,
      nextContextTime: 0,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(0);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 2,
      nextContextTime: 2,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    const noteStart = callbackResults[0];
    expect(noteStart.audioContextTime).toBe(1);
    expect(noteStart.transportTime).toBe(1);
    expect(noteStart.clipId).toBe("a");
    expect(noteStart.event.stage).toBe(NoteEventStage.Start);

    clipPlayer.updateClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 4,
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 4,
      shouldLoop: false,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 1 + 2,
          data: {},
        }, // Shift note to right of "playhead".
        {
          noteId: "note_a",
          stage: NoteEventStage.End,
          beatTime: 3 + 2,
          data: {},
        },
      ], // Shift note to right of "playhead".
    });

    expect(callbackResults.length).toBe(2);

    const noteEnd = callbackResults[1];
    expect(noteEnd.clipId).toBe("a");
    expect(noteEnd.event.stage).toBe(NoteEventStage.End);

    expect(noteStart.event.noteId).toBe(noteEnd.event.noteId);
  });

  it("updating-active-range-can-cause-notes-to-stop", () => {
    const callbackResults: {
      audioContextTime: number;
      transportTime: number;
      clipId: string;
      event: IClipEvent<unknown>;
    }[] = [];

    function callback(
      audioContextTime: number,
      transportTime: number,
      clipId: TUniqueIdentifier,
      event: IClipEvent<unknown>,
    ) {
      callbackResults.push({
        audioContextTime,
        transportTime,
        clipId,
        event,
      });
    }

    const clipPlayer = new ClipPlayer<unknown>(callback);
    clipPlayer.addClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 4,
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 4,
      shouldLoop: false,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 1,
          data: {},
        },
        {
          noteId: "note_a",
          stage: NoteEventStage.End,
          beatTime: 3,
          data: {},
        },
      ],
    });

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 0,
      nextContextTime: 0,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(0);

    clipPlayer.onTransportEvent({
      type: EventType.TransportPlayback,
      nextBeatTime: 2,
      nextContextTime: 2,
      tempo: 60,
    });
    expect(callbackResults.length).toBe(1);

    const noteStart = callbackResults[0];
    expect(noteStart.audioContextTime).toBe(1);
    expect(noteStart.transportTime).toBe(1);
    expect(noteStart.clipId).toBe("a");
    expect(noteStart.event.stage).toBe(NoteEventStage.Start);

    clipPlayer.updateClip({
      id: "a",
      startInTransportBeats: 0,
      endInTransportBeats: 1, // Shorten active range.
      activeRangeStartBeatTime: 0,
      activeRangeEndBeatTime: 1, // Shorten active range.
      shouldLoop: false,
      events: [
        {
          noteId: "note_a",
          stage: NoteEventStage.Start,
          beatTime: 1 - 2,
          data: {},
        },
        {
          noteId: "note_a",
          stage: NoteEventStage.End,
          beatTime: 3 - 2,
          data: {},
        },
      ],
    });

    expect(callbackResults.length).toBe(2);

    const noteEnd = callbackResults[1];
    expect(noteEnd.clipId).toBe("a");
    expect(noteEnd.event.stage).toBe(NoteEventStage.End);

    expect(noteStart.event.noteId).toBe(noteEnd.event.noteId);
  });
});
