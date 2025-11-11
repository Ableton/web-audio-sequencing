/**
 * This file provides a function to create an engine and view for
 * a provided example sequencer configuration.
 *
 * It provides a cleanup callback which when invoked removes
 * event listeners, audio nodes and animation frame loops.
 */

import { EventType, NoteEventStage } from "@ableton/web-audio-sequencing";
import { createEngine } from "./shared/engine.js";
import { mtof } from "./shared/utils.js";
import {
  createView,
  renderLanes,
  updatePlayhead,
  updateStepPlayState,
  renderPlayheadLane,
  renderClipControls,
  renderDurationRadio,
} from "./shared/view.js";
import { STEPS_PER_BEAT } from "./shared/constants.js";
import { setCurrentExample } from "./shared/context.js";

/**
 * @typedef {Object} ClipEventData
 * @property {number} lane
 * @property {number} step
 * @property {string} clipId
 */
/**
 * @typedef {import("@ableton/web-audio-sequencing").IClipEvent<ClipEventData>} ClipNoteEvent
 */

/**
 * @typedef {Object} sequencerData
 * @property {import("@ableton/web-audio-sequencing").IClip<ClipEventData>[]} clips
 * @property {number[]} lanes
 */

/**
 * @typedef {import("@ableton/web-audio-sequencing").ITransportEvent} ITransportEvent
 */

/**
 *
 * @param {sequencerData} sequencer
 * @param {AudioContext} audioContext
 * @returns {() => void} cleanup
 */
export function run(sequencer, audioContext) {
  setCurrentExample(sequencer);
  const engine = createEngine(onTransportEvent, onClipEvent, audioContext);
  sequencer.clips.forEach((clipData) => engine.clipPlayer.addClip(clipData));

  /**
   * In the engine transport events are already provided to the ClipPlayer
   * This function exists purely to provide visual feedback with a
   * playhead.
   * @param {ITransportEvent} event
   */
  function onTransportEvent(event) {
    switch (event.type) {
      case EventType.TransportPlayback: {
        performGuiEventNearAudioContextTime(function () {
          sequencer.clips.forEach((clip) => {
            const currentBeatTime = engine.getPlayheadPositionInBeatTime(
              clip.id,
            );
            updatePlayhead(clip.id, currentBeatTime);
          });
        }, event.nextContextTime);
        break;
      }
      case EventType.TransportStop: {
        sequencer.clips.forEach((clip) => {
          updatePlayhead(clip.id, 0);
        });
      }
    }
  }

  /**
   * @param {number} audioContextTime
   * @param {number} _transportTime
   * @param {string} clipId
   * @param {ClipNoteEvent} event
   */
  function onClipEvent(audioContextTime, _transportTime, clipId, event) {
    switch (event.stage) {
      case NoteEventStage.Start: {
        const frequency = mtof(60 + event.data.lane);
        engine.startVoice(event.noteId, frequency, audioContextTime);
        {
          const clipRef = engine.clipPlayer.getClip(clipId);
          if (clipRef && event.beatTime < clipRef.activeRangeEndBeatTime) {
            performGuiEventNearAudioContextTime(function () {
              updateStepPlayState(event.data.lane, event.data.step, true);
            }, audioContextTime);
          }
        }
        break;
      }
      case NoteEventStage.End: {
        engine.stopVoice(event.noteId, audioContextTime);
        performGuiEventNearAudioContextTime(function () {
          updateStepPlayState(event.data.lane, event.data.step, true);
        }, audioContextTime);
        break;
      }
      case NoteEventStage.Update: {
        engine.updateVoice(event.noteId, event.data.pitchOffsetInSemitones, audioContextTime);
        break;
      }
    }
  }

  const renderSequencer = () => {
    return sequencer.clips.map((clipData, index) => {
      const loopStart = clipData.activeRangeStartBeatTime * STEPS_PER_BEAT;
      const loopEnd = clipData.activeRangeEndBeatTime * STEPS_PER_BEAT;
      const clipStartTime = clipData.startInTransportBeats * STEPS_PER_BEAT;
      const maxSteps = clipData.endInTransportBeats * STEPS_PER_BEAT;

      const clipControls = renderClipControls(
        clipData.id,
        loopStart + 1,
        maxSteps,
        loopEnd,
        maxSteps,
      );
      const lanes = renderLanes(
        clipData.id,
        sequencer.clips[index],
        sequencer.lanes[index],
        loopStart,
        loopEnd,
        maxSteps,
      );
      const playhead = renderPlayheadLane(
        clipData.id,
        clipStartTime,
        loopStart,
        loopEnd,
        maxSteps,
      );

      const div = document.createElement("div");
      div.classList.add("sequencer-container");
      div.appendChild(clipControls);
      if (sequencer.durationOptions)
        div.appendChild(renderDurationRadio(sequencer.durationOptions));
      div.appendChild(lanes);
      div.appendChild(playhead);

      return div;
    });
  };

  const view = createView(renderSequencer(), engine);

  // Update GUI

  /** @typedef {() => void} GuiUpdateCallback */
  /** @type {{fx: GuiUpdateCallback, audioContextTime: number}[]} */
  let guiEventsToPerform = [];
  /**
   * Schedule a GUI update to occur when audio context time reaches audioContextTime.
   * @param {GuiUpdateCallback} fx
   * @param {number} audioContextTime
   */
  function performGuiEventNearAudioContextTime(fx, audioContextTime) {
    guiEventsToPerform.push({ fx, audioContextTime });
  }

  function onPerformGuiEvents() {
    guiEventsToPerform = guiEventsToPerform.reduce((acc, cur) => {
      if (audioContext.currentTime >= cur.audioContextTime) {
        cur.fx();
      } else {
        acc.push(cur);
      }
      return acc;
    }, []);
  }

  let animationFrameHandle = undefined;
  const animationFrameLoop = function () {
    onPerformGuiEvents();
    animationFrameHandle = requestAnimationFrame(animationFrameLoop);
  };

  animationFrameLoop();

  return () => {
    view.cleanup();
    engine.cleanup();
    if (animationFrameHandle !== undefined)
      cancelAnimationFrame(animationFrameHandle);
  };
}
