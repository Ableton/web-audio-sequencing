/**
 * Here we can see examples of how to update the components of the
 * sequencing engine.
 *
 * To update an existing clip, you should use ClipPlayer.updateClip() rather
 * than accessing a clip via ClipPlayer.getClip() and directly mutating it.
 * Calling the updateClip() method with a new (or cloned) clip object allows
 * the ClipPlayer to "diff" the current clip with the updated clip and ensure
 * that playing notes which have been moved (relative to the playhead) or
 * deleted can be gracefully ended.
 *
 */

import { NoteEventStage, TransportState } from "@ableton/web-audio-sequencing";
import { BEATS_PER_STEP, STEPS_PER_BEAT } from "./constants.js";
import { stepToBeatTime } from "./utils.js";
import { getCurrentExample } from "./context.js";

/**
 * @typedef {import("./engine.js").EngineAPI} Engine
 * @typedef {import("./engine.js").IClipEvent} IClipEvent
 */

/**
 *
 * @param {Engine} engine
 */
export function togglePlayState(engine) {
  const transport = engine.transport;
  const willStartPlayback = transport.getState() !== TransportState.Running;
  if (willStartPlayback) {
    transport.start();
  } else {
    transport.stop();
  }
}

/**
 *
 * @param {Engine} engine
 * @param {number} bpm
 */
export function setTempo(engine, bpm) {
  const transport = engine.transport;
  transport.setTempo(bpm);
}

/**
 * @param {string} clipId
 * @param {number} lane
 * @param {number} step
 * @param {NoteEventStage} stage
 * @param {number} beatTime
 * @returns {IClipEvent}
 */
function createStepSequencerNote(clipId, lane, step, stage, beatTime) {
  return {
    noteId: getNoteKey(clipId, lane, step),
    stage,
    beatTime,
    data: {
      clipId,
      lane,
      step,
    },
  };
}

/**
 * @param {string} clipId
 * @param {number} lane
 * @param {number} step
 * @returns {string}
 */
function getNoteKey(clipId, lane, step) {
  return `${clipId}-${lane}-${step}`;
}

/**
 *
 * @param {Engine} engine
 * @param {string} clipId
 * @param {number} lane
 * @param {number} step
 * @param {number} duration
 * @returns {void}
 */
export function toggleCell(engine, clipId, lane, step, duration) {
  const clipPlayer = engine.clipPlayer;
  const clip = clipPlayer.getClip(clipId);
  if (!clip) return;
  const newClip = structuredClone(clip);

  const isInserting =
    newClip.events.filter((v) => {
      return v.data.lane === lane && v.data.step === step;
    }).length === 0;

  if (isInserting) {
    const startBeatTime = stepToBeatTime(step, BEATS_PER_STEP);
    const endBeatTime = startBeatTime + duration;

    const startNote = createStepSequencerNote(
      clipId,
      lane,
      step,
      NoteEventStage.Start,
      startBeatTime,
    );
    const endNote = createStepSequencerNote(
      clipId,
      lane,
      step,
      NoteEventStage.End,
      endBeatTime,
    );

    newClip.events.push(startNote, endNote);

    // Only used in the "Per-note updates" example
    if (getCurrentExample().insertPerNoteUpdates) {
      let pitchOffsetInSemitones = 12;
      for (let time = startBeatTime; time <= endBeatTime; time += 0.25 * BEATS_PER_STEP) {
        newClip.events.push({
          noteId: getNoteKey(clipId, lane, step),
          stage: NoteEventStage.Update,
          beatTime: time,
          data: {
            pitchOffsetInSemitones,
          },
        });
        pitchOffsetInSemitones -= 1;
      }
    }
  } else {
    const noteKey = getNoteKey(clipId, lane, step);
    newClip.events = newClip.events.filter((ev) => ev.noteId !== noteKey);
  }
  newClip.events = validateClipEventsForLane(newClip.events, lane);
  clipPlayer.updateClip(newClip);
}

/**
 * @param {IClipEvent[]} events
 * @param {number} lane
 * @returns {IClipEvent[]}
 */
function validateClipEventsForLane(events, lane) {
  const laneEvents = events.filter((e) => e.data.lane === lane);
  if (laneEvents.length === 0) return events;

  /** @typedef {{start: IClipEvent, end: IClipEvent, startStep:number, endStepExclusive:number}} LaneNote */
  /** @type {LaneNote[]} */
  const laneNotes = [];
  const startEventsById = new Map();
  const endEventsById = new Map();

  for (const evt of laneEvents) {
    if (evt.stage === NoteEventStage.Start)
      startEventsById.set(evt.noteId, evt);
    else if (evt.stage === NoteEventStage.End)
      endEventsById.set(evt.noteId, evt);
  }

  for (const [noteId, startEvt] of startEventsById.entries()) {
    const endEvt = endEventsById.get(noteId);
    if (!endEvt) continue;
    const durationBeats = Math.max(0, endEvt.beatTime - startEvt.beatTime);
    const durationSteps = durationBeats * STEPS_PER_BEAT;
    laneNotes.push({
      start: startEvt,
      end: endEvt,
      startStep: startEvt.data.step,
      endStepExclusive: startEvt.data.step + durationSteps,
    });
  }

  laneNotes.sort((a, b) => a.startStep - b.startStep);

  /** @type {LaneNote[]} */
  const kept = [];

  for (const note of laneNotes) {
    const overlapsEarlier = kept.some(
      (k) =>
        note.startStep >= k.startStep && note.startStep < k.endStepExclusive,
    );
    if (!overlapsEarlier) {
      kept.push(note);
    }
  }

  /** @type {IClipEvent[]} */
  const newLaneEvents = [];
  for (const note of kept) {
    newLaneEvents.push(note.start, note.end);
  }

  const otherLaneEvents = events.filter((e) => e.data.lane !== lane);
  const newEvents = otherLaneEvents.concat(newLaneEvents);

  newEvents.sort((a, b) => {
    if (a.beatTime === b.beatTime) return a.stage - b.stage;
    return a.beatTime - b.beatTime;
  });

  return newEvents;
}

/**
 * @param {Engine} engine
 * @param {string} clipId
 * @param {{start: number} | {end: number} | {start: number, end: number}} update
 */
export function setClipActiveRange(engine, clipId, update) {
  const clipPlayer = engine.clipPlayer;
  const clip = clipPlayer.getClip(clipId);
  if (!clip) return;

  const startBeatTime =
    "start" in update
      ? stepToBeatTime(update.start, BEATS_PER_STEP)
      : clip.activeRangeStartBeatTime;
  const endBeatTime =
    "end" in update
      ? stepToBeatTime(update.end, BEATS_PER_STEP)
      : clip.activeRangeEndBeatTime;
  if (endBeatTime > startBeatTime) {
    clipPlayer.updateClip({
      ...clip,
      activeRangeStartBeatTime: startBeatTime,
      activeRangeEndBeatTime: endBeatTime,
    });
  }
}
