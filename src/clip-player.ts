import {
  NoteEventStage,
  type TNoteEventStage,
  EventType,
  type ITransportPlaybackEvent,
  type ITransportEvent,
} from "./event-types.ts";
import { NoteProcessor } from "./note-processor.ts";
import { type TUniqueIdentifier } from "./uuid.ts";

import type { IClip, IClipEvent } from "./clip.ts";

interface IClipAndPlaybackData<TEventData> {
  clip: IClip<TEventData>;
  noteProcessor: NoteProcessor;
  eventsForActiveRange: IClipEvent<TEventData>[];
}

type TClipPlayerCallback<TEventData> = (
  audioContextTime: number,
  transportTime: number,
  clipId: TUniqueIdentifier,
  event: IClipEvent<TEventData>,
) => void;

interface IInternalClipEvent<TEventData> extends IClipEvent<TEventData> {
  transportTime: number;
}

export class ClipPlayer<TEventData> {
  private clipsWithPlaybackData: Map<string, IClipAndPlaybackData<TEventData>>;
  private callback: TClipPlayerCallback<TEventData>;

  private lastTransportPlaybackEvent: ITransportPlaybackEvent | undefined;
  // See README for more info.
  private schedulingWindowLeadingEdgeInTransportBeats = 0;
  private schedulingWindowTrailingEdgeInTransportBeats = 0;

  private shouldWrapCorrespondingEndEventsAroundActiveRange = false;

  constructor(
    callback: TClipPlayerCallback<TEventData>,
    shouldWrapEndEventsInActiveRange = false,
  ) {
    this.clipsWithPlaybackData = new Map();
    this.callback = callback;
    this.shouldWrapCorrespondingEndEventsAroundActiveRange =
      shouldWrapEndEventsInActiveRange;
  }

  public addClip(c: IClip<TEventData>): void {
    if (this.clipsWithPlaybackData.has(c.id)) {
      throw new Error(`Clip ${c.id} already exists.`);
    }
    this.clipsWithPlaybackData.set(c.id, {
      clip: c,
      noteProcessor: new NoteProcessor(),
      eventsForActiveRange: this.getEventsForActiveRange(c),
    });
  }

  public getAllClips() {
    return this.clipsWithPlaybackData;
  }

  public removeClip(id: string): void {
    const clipAndPlaybackData = this.clipsWithPlaybackData.get(id);
    if (clipAndPlaybackData !== undefined) {
      this.scheduleEndEventsForCurrentlyPlayingNotesInClip(clipAndPlaybackData);
      this.clipsWithPlaybackData.delete(id);
    }
  }

  public removeAllClips(): void {
    this.clipsWithPlaybackData.forEach((clip, key) => this.removeClip(key));
  }

  public updateClip(c: IClip<TEventData>): void {
    const clipAndPlaybackData = this.clipsWithPlaybackData.get(c.id);
    if (clipAndPlaybackData !== undefined) {
      this.scheduleEndEventsForClipUpdate(clipAndPlaybackData, c);
      clipAndPlaybackData.clip = c;
      clipAndPlaybackData.eventsForActiveRange =
        this.getEventsForActiveRange(c);
    } else {
      throw new Error("Cannot update clip that was never added!");
    }
  }

  public getClip(id: string): IClip<TEventData> | undefined {
    const clipWithPlaybackData = this.clipsWithPlaybackData.get(id);
    return clipWithPlaybackData ? clipWithPlaybackData.clip : undefined;
  }

  public scheduleEndEventsForAllCurrentlyPlayingClips() {
    this.clipsWithPlaybackData.forEach((clipAndPlaybackData) => {
      this.scheduleEndEventsForCurrentlyPlayingNotesInClip(clipAndPlaybackData);
    });
  }

  private scheduleEndEventsForCurrentlyPlayingNotesInClip(
    clipAndPlaybackData: IClipAndPlaybackData<TEventData>,
  ) {
    this.scheduleEndEventsForNotes(
      clipAndPlaybackData,
      clipAndPlaybackData.noteProcessor.playingNoteIds(),
    );
  }

  private scheduleEndEventsForClipUpdate(
    clipAndPlaybackData: IClipAndPlaybackData<TEventData>,
    newClip: IClip<TEventData>,
  ) {
    if (
      newClip.activeRangeStartBeatTime !==
        clipAndPlaybackData.clip.activeRangeStartBeatTime ||
      newClip.activeRangeEndBeatTime !==
        clipAndPlaybackData.clip.activeRangeEndBeatTime
    ) {
      // TODO: Handle this a bit more gracefully for smoother experience.
      this.scheduleEndEventsForCurrentlyPlayingNotesInClip(clipAndPlaybackData);
    } else {
      const notesToStop = new Set<string>();

      const schedulingWindowTrailingEdgeInClipBeats =
        this.transportBeatTimeToClipBeatTime(
          clipAndPlaybackData.clip,
          this.schedulingWindowTrailingEdgeInTransportBeats,
        );

      clipAndPlaybackData.noteProcessor.playingNoteIds().forEach((noteId) => {
        // Stop notes which have left the active range entirely.
        const newStartEvent = newClip.events.find(
          (e) => e.noteId === noteId && e.stage === NoteEventStage.Start,
        );
        const newEndEvent = newClip.events.find(
          (e) => e.noteId === noteId && e.stage === NoteEventStage.End,
        );

        const newStartEventIsInActiveRange =
          newStartEvent &&
          newStartEvent.beatTime >= newClip.activeRangeStartBeatTime &&
          newStartEvent.beatTime < newClip.activeRangeEndBeatTime;

        const newEndEventIsInActiveRange =
          newEndEvent &&
          newEndEvent.beatTime > newClip.activeRangeStartBeatTime &&
          newEndEvent.beatTime <= newClip.activeRangeEndBeatTime;

        const noteMovedOutsideActiveRange =
          !newStartEventIsInActiveRange && !newEndEventIsInActiveRange;

        // Stop notes which no longer "intersect" with playhead
        const noteMovedAfterPlayhead =
          newStartEvent &&
          newStartEvent.beatTime >= schedulingWindowTrailingEdgeInClipBeats;

        const noteMovedBeforePlayhead =
          newEndEvent &&
          newEndEvent.beatTime <= schedulingWindowTrailingEdgeInClipBeats;

        if (
          noteMovedOutsideActiveRange ||
          noteMovedAfterPlayhead ||
          noteMovedBeforePlayhead
        ) {
          notesToStop.add(noteId);
        }
      });

      this.scheduleEndEventsForNotes(clipAndPlaybackData, notesToStop);
    }
  }

  private scheduleEndEventsForNotes(
    clipAndPlaybackData: IClipAndPlaybackData<TEventData>,
    noteIds: Set<TUniqueIdentifier>,
  ) {
    noteIds.forEach((noteId) => {
      const endClipEvent = clipAndPlaybackData.clip.events.find((e) => {
        return e.stage === NoteEventStage.End && e.noteId === noteId;
      });

      if (endClipEvent !== undefined) {
        const endEventToSchedule = structuredClone(
          endClipEvent,
        ) as IInternalClipEvent<TEventData>;
        endEventToSchedule.transportTime =
          this.schedulingWindowLeadingEdgeInTransportBeats;
        if (this.lastTransportPlaybackEvent !== undefined) {
          this.scheduleEventForPlayback(
            endEventToSchedule,
            this.lastTransportPlaybackEvent,
            clipAndPlaybackData,
          );
        }
      }
    });
  }

  public onTransportEvent(e: ITransportEvent) {
    switch (e.type) {
      case EventType.TransportPlayback: {
        this.lastTransportPlaybackEvent = e;
        this.schedulingWindowLeadingEdgeInTransportBeats = e.nextBeatTime;
        for (const id of this.clipsWithPlaybackData.keys()) {
          this.handleClipPlayback(id, e);
        }
        this.schedulingWindowTrailingEdgeInTransportBeats = e.nextBeatTime;
        break;
      }
      case EventType.TransportStop: {
        this.scheduleEndEventsForAllCurrentlyPlayingClips();
        this.lastTransportPlaybackEvent = undefined;
        this.schedulingWindowLeadingEdgeInTransportBeats = 0;
        this.schedulingWindowTrailingEdgeInTransportBeats = 0;
        break;
      }
    }
  }

  private transportBeatTimeToUnrolledClipBeatTime(
    clip: IClip<TEventData>,
    transportBeatTime: number,
  ): number {
    return (
      transportBeatTime -
      clip.startInTransportBeats +
      clip.activeRangeStartBeatTime
    );
  }

  public transportBeatTimeToClipBeatTime(
    clip: IClip<TEventData>,
    transportBeatTime: number,
  ): number {
    const unrolledClipBeatTime = this.transportBeatTimeToUnrolledClipBeatTime(
      clip,
      transportBeatTime,
    );
    if (clip.shouldLoop) {
      const loopRange = this.getLoopStartEndBeatTimes(clip);
      const loopLengthInBeats = loopRange.end - loopRange.start;
      const beatTimeRelativeToLoop =
        loopLengthInBeats > 0
          ? (unrolledClipBeatTime - loopRange.start) % loopLengthInBeats
          : 0;
      return beatTimeRelativeToLoop + loopRange.start;
    } else {
      if (unrolledClipBeatTime >= clip.activeRangeEndBeatTime) {
        return clip.activeRangeEndBeatTime;
      }
    }
    return unrolledClipBeatTime;
  }

  private clipBeatTimeToTransportBeatTime(
    clip: IClip<TEventData>,
    clipBeatTime: number,
  ): number {
    return (
      clipBeatTime + clip.startInTransportBeats - clip.activeRangeStartBeatTime
    );
  }

  private getEventsForActiveRange(
    clip: IClip<TEventData>,
  ): IClipEvent<TEventData>[] {
    type TNoteId = TUniqueIdentifier;
    const startEvents: Map<TNoteId, IClipEvent<TEventData>> = new Map();
    const endEvents: Map<TNoteId, IClipEvent<TEventData>> = new Map();
    const eventsForActiveRange: IClipEvent<TEventData>[] = [];

    clip.events.forEach((e) => {
      if (this.isClipEventInActiveRange(clip, e)) {
        switch (e.stage) {
          case NoteEventStage.InstantaneousStartEnd:
            eventsForActiveRange.push(e);
            break;
          case NoteEventStage.Update:
            eventsForActiveRange.push(e);
            break;
          case NoteEventStage.Start:
            startEvents.set(e.noteId, e);
            break;
          case NoteEventStage.End:
            endEvents.set(e.noteId, e);
            break;
        }
      }
    });

    startEvents.forEach((e, noteId) => {
      eventsForActiveRange.push(e);
      const correspondingEnd = endEvents.get(noteId);
      if (correspondingEnd) {
        eventsForActiveRange.push(correspondingEnd);
      } else {
        const correspondingEnd = clip.events.find(
          (x) => x.noteId === e.noteId && x.stage === NoteEventStage.End,
        );
        if (correspondingEnd === undefined) {
          throw new Error("Could not find corresponding end for event!");
        }
        const shiftedEndEvent = structuredClone(correspondingEnd);
        let idealBeatTime = clip.activeRangeEndBeatTime;
        if (this.shouldWrapCorrespondingEndEventsAroundActiveRange) {
          idealBeatTime = wrapNumberInRange(
            shiftedEndEvent.beatTime,
            clip.activeRangeStartBeatTime,
            clip.activeRangeEndBeatTime,
          );
          if (idealBeatTime === e.beatTime) {
            idealBeatTime = wrapNumberInRange(
              idealBeatTime - 0.00001,
              clip.activeRangeStartBeatTime,
              clip.activeRangeEndBeatTime,
            );
          }
        }
        shiftedEndEvent.beatTime = idealBeatTime;
        eventsForActiveRange.push(shiftedEndEvent);
      }
    });

    // Sort events by beatTime first, then by stage priority (Start, Update, End)
    eventsForActiveRange.sort((a, b) => {
      if (a.beatTime !== b.beatTime) {
        return a.beatTime - b.beatTime;
      }

      const stagePriority = (stage: TNoteEventStage): number => {
        switch (stage) {
          case NoteEventStage.Start:
          case NoteEventStage.InstantaneousStartEnd:
            return 0;
          case NoteEventStage.Update:
            return 1;
          case NoteEventStage.End:
            return 2;
          default:
            return 3;
        }
      };

      return stagePriority(a.stage) - stagePriority(b.stage);
    });

    return eventsForActiveRange;
  }

  private handleClipPlayback(
    clipId: string,
    transportEvent: ITransportPlaybackEvent,
  ) {
    const clipAndPlaybackData = this.clipsWithPlaybackData.get(clipId);
    if (clipAndPlaybackData === undefined) {
      throw new Error(`Clip ${clipId} not found`);
    }

    const clip = clipAndPlaybackData.clip;
    const eventsForActiveRange = clipAndPlaybackData.eventsForActiveRange;

    if (clip.shouldLoop) {
      const loopRange = this.getLoopStartEndBeatTimes(clip);
      const loopLengthInBeats = loopRange.end - loopRange.start;

      const clipRelativeBeatTimeOfLeadingEdge =
        this.transportBeatTimeToUnrolledClipBeatTime(
          clip,
          this.schedulingWindowLeadingEdgeInTransportBeats,
        );

      const clipRelativeBeatTimeOfTrailingEdge =
        this.transportBeatTimeToUnrolledClipBeatTime(
          clip,
          this.schedulingWindowTrailingEdgeInTransportBeats,
        );

      const loopRelativeBeatTimeOfLeadingEdge =
        clipRelativeBeatTimeOfLeadingEdge - loopRange.start;

      const loopRelativeBeatTimeOfTrailingEdge =
        clipRelativeBeatTimeOfTrailingEdge - loopRange.start;

      const loopIterationForLeadingEdge = Math.floor(
        loopRelativeBeatTimeOfLeadingEdge / loopLengthInBeats,
      );

      let loopIterationForTrailingEdge = Math.floor(
        loopRelativeBeatTimeOfTrailingEdge / loopLengthInBeats,
      );

      if (loopRelativeBeatTimeOfTrailingEdge % loopLengthInBeats === 0) {
        // If our trailing edge sits directly on a loop end boundary,
        // we need to ensure that all events in the previous iteration
        // are also unrolled, as events that occur directly on the
        // boundary still need to be scheduled, since the leading edge
        // of our window is exclusive.
        loopIterationForTrailingEdge -= 1;
      }

      for (
        let it = loopIterationForTrailingEdge;
        it <= loopIterationForLeadingEdge;
        it++
      ) {
        eventsForActiveRange.forEach((clipEvent) => {
          const transportRelativeBeatTime =
            this.clipBeatTimeToTransportBeatTime(clip, clipEvent.beatTime);
          const transportTime =
            transportRelativeBeatTime + it * loopLengthInBeats;

          if (this.isTransportBeatTimeInSchedulingWindow(transportTime)) {
            const event = {
              noteId: clipEvent.noteId,
              stage: clipEvent.stage,
              beatTime: clipEvent.beatTime,
              data: clipEvent.data,
              transportTime: transportTime,
            };

            this.scheduleEventForPlayback(
              event,
              transportEvent,
              clipAndPlaybackData,
            );
          }
        });
      }
    } else {
      // non-looped case
      eventsForActiveRange.forEach((clipEvent) => {
        const transportTime = this.clipBeatTimeToTransportBeatTime(
          clip,
          clipEvent.beatTime,
        );

        if (this.isTransportBeatTimeInSchedulingWindow(transportTime)) {
          const event = {
            noteId: clipEvent.noteId,
            stage: clipEvent.stage,
            beatTime: clipEvent.beatTime,
            data: clipEvent.data,
            transportTime,
          };

          this.scheduleEventForPlayback(
            event,
            transportEvent,
            clipAndPlaybackData,
          );
        }
      });
    }
  }

  private scheduleEventForPlayback(
    event: IInternalClipEvent<TEventData>,
    transportEvent: ITransportPlaybackEvent,
    clipAndPlaybackData: IClipAndPlaybackData<TEventData>,
  ): void {
    switch (event.stage) {
      case NoteEventStage.End: {
        if (
          !clipAndPlaybackData.noteProcessor.playingNoteIds().has(event.noteId)
        ) {
          // No need to play back end events for notes which aren't held.
          return;
        }
      }
    }

    const noteInfo = clipAndPlaybackData.noteProcessor.process(
      event.noteId,
      event.stage,
    );

    if (noteInfo === undefined) {
      return;
    }

    event.noteId = noteInfo.idForScheduling;

    const nextTransportBeatTime = transportEvent.nextBeatTime;
    const contextTimeForNextTransportBeatTime = transportEvent.nextContextTime;
    const transportTempo = transportEvent.tempo;

    const deltaBeats = event.transportTime - nextTransportBeatTime;
    const deltaTimeInSeconds = deltaBeats * (60 / transportTempo);
    const scheduledAudioContextTimeForEvent =
      contextTimeForNextTransportBeatTime + deltaTimeInSeconds;

    this.callback(
      scheduledAudioContextTimeForEvent,
      event.transportTime,
      clipAndPlaybackData.clip.id,
      event,
    );
  }

  private getLoopStartEndBeatTimes(clip: IClip<TEventData>): {
    start: number;
    end: number;
  } {
    return {
      start: clip.activeRangeStartBeatTime,
      end: clip.activeRangeEndBeatTime,
    };
  }

  private isClipEventInActiveRange(
    clip: IClip<TEventData>,
    e: IClipEvent<TEventData>,
  ): boolean {
    return (
      e.beatTime >= clip.activeRangeStartBeatTime &&
      e.beatTime <= clip.activeRangeEndBeatTime
    );
  }

  // See README for more info.
  private isTransportBeatTimeInSchedulingWindow(
    transportBeatTime: number,
  ): boolean {
    return (
      transportBeatTime >= this.schedulingWindowTrailingEdgeInTransportBeats &&
      transportBeatTime < this.schedulingWindowLeadingEdgeInTransportBeats
    );
  }
}

function wrapNumberInRange(number: number, min: number, max: number) {
  if (min > max) {
    [min, max] = [max, min];
  }

  if (min === max) return min;
  const rangeWidth = max - min;
  let wrappedNumber = number;
  if (number < min || number > max) {
    wrappedNumber =
      min + ((((number - min) % rangeWidth) + rangeWidth) % rangeWidth);
  }

  return wrappedNumber;
}
