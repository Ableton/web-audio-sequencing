import { NoteEventStage, EventType, } from "./event-types.js";
import { NoteProcessor } from "./note-processor.js";
export class ClipPlayer {
    constructor(callback, shouldWrapEndEventsInActiveRange = false) {
        this.schedulingWindowLeadingEdgeInTransportBeats = 0;
        this.schedulingWindowTrailingEdgeInTransportBeats = 0;
        this.shouldWrapCorrespondingEndEventsAroundActiveRange = false;
        this.clipsWithPlaybackData = new Map();
        this.callback = callback;
        this.shouldWrapCorrespondingEndEventsAroundActiveRange =
            shouldWrapEndEventsInActiveRange;
    }
    addClip(c) {
        if (this.clipsWithPlaybackData.has(c.id)) {
            throw new Error(`Clip ${c.id} already exists.`);
        }
        this.clipsWithPlaybackData.set(c.id, {
            clip: c,
            noteProcessor: new NoteProcessor(),
            eventsForActiveRange: this.getEventsForActiveRange(c),
        });
    }
    getAllClips() {
        return this.clipsWithPlaybackData;
    }
    removeClip(id) {
        const clipAndPlaybackData = this.clipsWithPlaybackData.get(id);
        if (clipAndPlaybackData !== undefined) {
            this.scheduleEndEventsForCurrentlyPlayingNotesInClip(clipAndPlaybackData);
            this.clipsWithPlaybackData.delete(id);
        }
    }
    removeAllClips() {
        this.clipsWithPlaybackData.forEach((clip, key) => this.removeClip(key));
    }
    updateClip(c) {
        const clipAndPlaybackData = this.clipsWithPlaybackData.get(c.id);
        if (clipAndPlaybackData !== undefined) {
            this.scheduleEndEventsForClipUpdate(clipAndPlaybackData, c);
            clipAndPlaybackData.clip = c;
            clipAndPlaybackData.eventsForActiveRange =
                this.getEventsForActiveRange(c);
        }
        else {
            throw new Error("Cannot update clip that was never added!");
        }
    }
    getClip(id) {
        const clipWithPlaybackData = this.clipsWithPlaybackData.get(id);
        return clipWithPlaybackData ? clipWithPlaybackData.clip : undefined;
    }
    scheduleEndEventsForAllCurrentlyPlayingClips() {
        this.clipsWithPlaybackData.forEach((clipAndPlaybackData) => {
            this.scheduleEndEventsForCurrentlyPlayingNotesInClip(clipAndPlaybackData);
        });
    }
    scheduleEndEventsForCurrentlyPlayingNotesInClip(clipAndPlaybackData) {
        this.scheduleEndEventsForNotes(clipAndPlaybackData, clipAndPlaybackData.noteProcessor.playingNoteIds());
    }
    scheduleEndEventsForClipUpdate(clipAndPlaybackData, newClip) {
        if (newClip.activeRangeStartBeatTime !==
            clipAndPlaybackData.clip.activeRangeStartBeatTime ||
            newClip.activeRangeEndBeatTime !==
                clipAndPlaybackData.clip.activeRangeEndBeatTime) {
            this.scheduleEndEventsForCurrentlyPlayingNotesInClip(clipAndPlaybackData);
        }
        else {
            const notesToStop = new Set();
            const schedulingWindowTrailingEdgeInClipBeats = this.transportBeatTimeToClipBeatTime(clipAndPlaybackData.clip, this.schedulingWindowTrailingEdgeInTransportBeats);
            clipAndPlaybackData.noteProcessor.playingNoteIds().forEach((noteId) => {
                const newStartEvent = newClip.events.find((e) => e.noteId === noteId && e.stage === NoteEventStage.Start);
                const newEndEvent = newClip.events.find((e) => e.noteId === noteId && e.stage === NoteEventStage.End);
                const newStartEventIsInActiveRange = newStartEvent &&
                    newStartEvent.beatTime >= newClip.activeRangeStartBeatTime &&
                    newStartEvent.beatTime < newClip.activeRangeEndBeatTime;
                const newEndEventIsInActiveRange = newEndEvent &&
                    newEndEvent.beatTime > newClip.activeRangeStartBeatTime &&
                    newEndEvent.beatTime <= newClip.activeRangeEndBeatTime;
                const noteMovedOutsideActiveRange = !newStartEventIsInActiveRange && !newEndEventIsInActiveRange;
                const noteMovedAfterPlayhead = newStartEvent &&
                    newStartEvent.beatTime >= schedulingWindowTrailingEdgeInClipBeats;
                const noteMovedBeforePlayhead = newEndEvent &&
                    newEndEvent.beatTime <= schedulingWindowTrailingEdgeInClipBeats;
                if (noteMovedOutsideActiveRange ||
                    noteMovedAfterPlayhead ||
                    noteMovedBeforePlayhead) {
                    notesToStop.add(noteId);
                }
            });
            this.scheduleEndEventsForNotes(clipAndPlaybackData, notesToStop);
        }
    }
    scheduleEndEventsForNotes(clipAndPlaybackData, noteIds) {
        noteIds.forEach((noteId) => {
            const endClipEvent = clipAndPlaybackData.clip.events.find((e) => {
                return e.stage === NoteEventStage.End && e.noteId === noteId;
            });
            if (endClipEvent !== undefined) {
                const endEventToSchedule = structuredClone(endClipEvent);
                endEventToSchedule.transportTime =
                    this.schedulingWindowLeadingEdgeInTransportBeats;
                if (this.lastTransportPlaybackEvent !== undefined) {
                    this.scheduleEventForPlayback(endEventToSchedule, this.lastTransportPlaybackEvent, clipAndPlaybackData);
                }
            }
        });
    }
    onTransportEvent(e) {
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
    transportBeatTimeToUnrolledClipBeatTime(clip, transportBeatTime) {
        return (transportBeatTime -
            clip.startInTransportBeats +
            clip.activeRangeStartBeatTime);
    }
    transportBeatTimeToClipBeatTime(clip, transportBeatTime) {
        const unrolledClipBeatTime = this.transportBeatTimeToUnrolledClipBeatTime(clip, transportBeatTime);
        if (clip.shouldLoop) {
            const loopRange = this.getLoopStartEndBeatTimes(clip);
            const loopLengthInBeats = loopRange.end - loopRange.start;
            const beatTimeRelativeToLoop = loopLengthInBeats > 0
                ? (unrolledClipBeatTime - loopRange.start) % loopLengthInBeats
                : 0;
            return beatTimeRelativeToLoop + loopRange.start;
        }
        else {
            if (unrolledClipBeatTime >= clip.activeRangeEndBeatTime) {
                return clip.activeRangeEndBeatTime;
            }
        }
        return unrolledClipBeatTime;
    }
    clipBeatTimeToTransportBeatTime(clip, clipBeatTime) {
        return (clipBeatTime + clip.startInTransportBeats - clip.activeRangeStartBeatTime);
    }
    getEventsForActiveRange(clip) {
        const startEvents = new Map();
        const endEvents = new Map();
        const eventsForActiveRange = [];
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
            }
            else {
                const correspondingEnd = clip.events.find((x) => x.noteId === e.noteId && x.stage === NoteEventStage.End);
                if (correspondingEnd === undefined) {
                    throw new Error("Could not find corresponding end for event!");
                }
                const shiftedEndEvent = structuredClone(correspondingEnd);
                let idealBeatTime = clip.activeRangeEndBeatTime;
                if (this.shouldWrapCorrespondingEndEventsAroundActiveRange) {
                    idealBeatTime = wrapNumberInRange(shiftedEndEvent.beatTime, clip.activeRangeStartBeatTime, clip.activeRangeEndBeatTime);
                    if (idealBeatTime === e.beatTime) {
                        idealBeatTime = wrapNumberInRange(idealBeatTime - 0.00001, clip.activeRangeStartBeatTime, clip.activeRangeEndBeatTime);
                    }
                }
                shiftedEndEvent.beatTime = idealBeatTime;
                eventsForActiveRange.push(shiftedEndEvent);
            }
        });
        eventsForActiveRange.sort((a, b) => {
            if (a.beatTime !== b.beatTime) {
                return a.beatTime - b.beatTime;
            }
            const stagePriority = (stage) => {
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
    handleClipPlayback(clipId, transportEvent) {
        const clipAndPlaybackData = this.clipsWithPlaybackData.get(clipId);
        if (clipAndPlaybackData === undefined) {
            throw new Error(`Clip ${clipId} not found`);
        }
        const clip = clipAndPlaybackData.clip;
        const eventsForActiveRange = clipAndPlaybackData.eventsForActiveRange;
        if (clip.shouldLoop) {
            const loopRange = this.getLoopStartEndBeatTimes(clip);
            const loopLengthInBeats = loopRange.end - loopRange.start;
            const clipRelativeBeatTimeOfLeadingEdge = this.transportBeatTimeToUnrolledClipBeatTime(clip, this.schedulingWindowLeadingEdgeInTransportBeats);
            const clipRelativeBeatTimeOfTrailingEdge = this.transportBeatTimeToUnrolledClipBeatTime(clip, this.schedulingWindowTrailingEdgeInTransportBeats);
            const loopRelativeBeatTimeOfLeadingEdge = clipRelativeBeatTimeOfLeadingEdge - loopRange.start;
            const loopRelativeBeatTimeOfTrailingEdge = clipRelativeBeatTimeOfTrailingEdge - loopRange.start;
            const loopIterationForLeadingEdge = Math.floor(loopRelativeBeatTimeOfLeadingEdge / loopLengthInBeats);
            let loopIterationForTrailingEdge = Math.floor(loopRelativeBeatTimeOfTrailingEdge / loopLengthInBeats);
            if (loopRelativeBeatTimeOfTrailingEdge % loopLengthInBeats === 0) {
                loopIterationForTrailingEdge -= 1;
            }
            for (let it = loopIterationForTrailingEdge; it <= loopIterationForLeadingEdge; it++) {
                eventsForActiveRange.forEach((clipEvent) => {
                    const transportRelativeBeatTime = this.clipBeatTimeToTransportBeatTime(clip, clipEvent.beatTime);
                    const transportTime = transportRelativeBeatTime + it * loopLengthInBeats;
                    if (this.isTransportBeatTimeInSchedulingWindow(transportTime)) {
                        const event = {
                            noteId: clipEvent.noteId,
                            stage: clipEvent.stage,
                            beatTime: clipEvent.beatTime,
                            data: clipEvent.data,
                            transportTime: transportTime,
                        };
                        this.scheduleEventForPlayback(event, transportEvent, clipAndPlaybackData);
                    }
                });
            }
        }
        else {
            eventsForActiveRange.forEach((clipEvent) => {
                const transportTime = this.clipBeatTimeToTransportBeatTime(clip, clipEvent.beatTime);
                if (this.isTransportBeatTimeInSchedulingWindow(transportTime)) {
                    const event = {
                        noteId: clipEvent.noteId,
                        stage: clipEvent.stage,
                        beatTime: clipEvent.beatTime,
                        data: clipEvent.data,
                        transportTime,
                    };
                    this.scheduleEventForPlayback(event, transportEvent, clipAndPlaybackData);
                }
            });
        }
    }
    scheduleEventForPlayback(event, transportEvent, clipAndPlaybackData) {
        switch (event.stage) {
            case NoteEventStage.End: {
                if (!clipAndPlaybackData.noteProcessor.playingNoteIds().has(event.noteId)) {
                    return;
                }
            }
        }
        const noteInfo = clipAndPlaybackData.noteProcessor.process(event.noteId, event.stage);
        if (noteInfo === undefined) {
            return;
        }
        event.noteId = noteInfo.idForScheduling;
        const nextTransportBeatTime = transportEvent.nextBeatTime;
        const contextTimeForNextTransportBeatTime = transportEvent.nextContextTime;
        const transportTempo = transportEvent.tempo;
        const deltaBeats = event.transportTime - nextTransportBeatTime;
        const deltaTimeInSeconds = deltaBeats * (60 / transportTempo);
        const scheduledAudioContextTimeForEvent = contextTimeForNextTransportBeatTime + deltaTimeInSeconds;
        this.callback(scheduledAudioContextTimeForEvent, event.transportTime, clipAndPlaybackData.clip.id, event);
    }
    getLoopStartEndBeatTimes(clip) {
        return {
            start: clip.activeRangeStartBeatTime,
            end: clip.activeRangeEndBeatTime,
        };
    }
    isClipEventInActiveRange(clip, e) {
        return (e.beatTime >= clip.activeRangeStartBeatTime &&
            e.beatTime <= clip.activeRangeEndBeatTime);
    }
    isTransportBeatTimeInSchedulingWindow(transportBeatTime) {
        return (transportBeatTime >= this.schedulingWindowTrailingEdgeInTransportBeats &&
            transportBeatTime < this.schedulingWindowLeadingEdgeInTransportBeats);
    }
}
function wrapNumberInRange(number, min, max) {
    if (min > max) {
        [min, max] = [max, min];
    }
    if (min === max)
        return min;
    const rangeWidth = max - min;
    let wrappedNumber = number;
    if (number < min || number > max) {
        wrappedNumber =
            min + ((((number - min) % rangeWidth) + rangeWidth) % rangeWidth);
    }
    return wrappedNumber;
}
