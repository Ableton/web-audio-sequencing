/**
 * This file provides an API over an engine with the following components:
 * - Clock
 * - Transport
 * - ClipPlayer
 *
 * These components combine to provide stable sequencing, which in this
 * engine allows for creating and ending Web Audio API nodes according
 * to the clip data.
 *
 * To see how to update the clip data, please view the updates.js file.
 */

import {
  Transport,
  Clock,
  ClipPlayer,
  TransportState,
} from "@ableton/web-audio-sequencing";

/**
 * @typedef {import("@ableton/web-audio-sequencing").ITransportEvent} ITransportEvent
 * @typedef {import("@ableton/web-audio-sequencing").IClipEvent} IClipEvent
 * @typedef {import("@ableton/web-audio-sequencing").NoteEventStage} NoteEventStage
 */

/**
 * @typedef {Object} EngineAPI
 * @property {AudioContext} audioContext
 * @property {Transport} transport
 * @property {Clock} clock
 * @property {ClipPlayer} clipPlayer
 * @property {(clipId:string)=>number} getPlayheadPositionInBeatTime
 * @property {(noteId:string, frequency:number, audioContextTime:number)=>void} startVoice
 * @property {(noteId:string, audioContextTime:number)=>void} stopVoice
 * @property {(noteId:string, semitoneOffset:number, audioContextTime:number)=>void} updateVoice
 * @property {(frequency:number)=>void} auditionSynth
 * @property {()=>void} cleanup
 */

/**
 * @param {(event:ITransportEvent)=>void} onTransport
 * @param {(audioContextTime:number, transportBeatTime:number, clipId:string, clipEvent:IClipEvent)=>void} onClip
 * @param {AudioContext} audioContext
 * @returns {EngineAPI}
 */
export function createEngine(
  onTransport,
  onClip,
  audioContext = new AudioContext(),
) {
  const outputNode = new GainNode(audioContext);
  outputNode.connect(audioContext.destination);
  const clock = new Clock(audioContext);
  const clipPlayer = new ClipPlayer(onClip, false);
  const transport = new Transport(clock, handleTransportEvent);

  /**
   * The transport event handler must call clipPlayer.onTransportEvent
   * to schedule events according to beat time
   * @param {ITransportEvent} ev
   */
  function handleTransportEvent(ev) {
    clipPlayer.onTransportEvent(ev);
    onTransport(ev);
  }

  /**
   * @param {string} clipId
   * @returns {number}
   */
  function getPlayheadPositionInBeatTime(clipId) {
    const clip = clipPlayer.getClip(clipId);
    if (!clip) return 0;
    const beats = clipPlayer.transportBeatTimeToClipBeatTime(
      clip,
      transport.currentBeatTime,
    );
    return transport.getState() === TransportState.Running ? beats : 0;
  }

  /** @type {Map<string,{osc:OscillatorNode,gain:GainNode,frequency:number}>} */
  const noteSynths = new Map();

  /**
   * @param {string} noteId
   * @param {number} frequency
   * @param {number} audioContextTime
   */
  function startVoice(noteId, frequency, audioContextTime) {
    const osc = new OscillatorNode(audioContext, {
      type: "triangle",
      frequency,
    });
    const gain = new GainNode(audioContext, { gain: 0 });
    osc.connect(gain);
    gain.connect(outputNode);
    noteSynths.set(noteId, { osc, gain, frequency });
    osc.start(audioContextTime);
    gain.gain.setTargetAtTime(0.5, audioContextTime, 0.01);
  }

  /**
   * @param {string} noteId
   * @param {number} audioContextTime
   */
  function stopVoice(noteId, audioContextTime) {
    const nodes = noteSynths.get(noteId);
    if (!nodes) return;
    nodes.gain.gain.setTargetAtTime(0, audioContextTime, 0.05);
    nodes.osc.stop(audioContextTime + 0.5);
    nodes.osc.onended = () => {
      nodes.gain.disconnect();
      nodes.osc.disconnect();
    };
    noteSynths.delete(noteId);
  }

  /**
   * @param {string} noteId
   * @param {number} semitoneOffset
   * @param {number} audioContextTime
   */
  function updateVoice(noteId, semitoneOffset, audioContextTime) {
    const nodes = noteSynths.get(noteId);
    if (!nodes) return;
    nodes.osc.frequency.setValueAtTime(
      nodes.frequency * Math.pow(2, semitoneOffset / 12),
      audioContextTime
    );
  }

  /**
   * @param {number} frequency
   */
  function auditionSynth(frequency) {
    const osc = new OscillatorNode(audioContext, {
      type: "triangle",
      frequency,
    });
    const gain = new GainNode(audioContext, { gain: 0 });
    osc.connect(gain);
    gain.connect(outputNode);
    const now = audioContext.currentTime;
    osc.start(now);
    gain.gain.setTargetAtTime(0.4, now, 0.01);
    gain.gain.setTargetAtTime(0, now + 0.05, 0.05);
    osc.stop(now + 1);
    osc.onended = () => {
      gain.disconnect();
      osc.disconnect();
    };
  }

  function cleanup() {
    transport.stop();
    clock.cleanup();
    outputNode.disconnect();
    for (const [, nodes] of noteSynths) {
      nodes.gain.disconnect();
      nodes.osc.disconnect();
    }
    noteSynths.clear();
  }

  return {
    audioContext,
    transport,
    clock,
    clipPlayer,
    getPlayheadPositionInBeatTime,
    auditionSynth,
    startVoice,
    stopVoice,
    updateVoice,
    cleanup,
  };
}
