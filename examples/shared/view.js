/**
 * This file contains functions necessary for creating and interacting
 * with the DOM nodes that represent the clips for these example
 * sequencers.
 *
 * To see how the engine components are updated following UI interaction
 * please take a look at updates.js and engine.js.
 */

import { TransportState, NoteEventStage } from "@ableton/web-audio-sequencing";
import { STEPS_PER_BEAT } from "./constants.js";
import { mtof } from "./utils.js";
import {
  setClipActiveRange,
  setTempo,
  toggleCell,
  togglePlayState,
} from "./updates.js";

/**
 * @typedef {Object} CurrentCell
 * @property {number} step
 * @property {number} lane
 * @property {string | undefined} clipId
 */

/**
 * @typedef {import("../example-sequencer.js").ClipNoteEvent} ClipNoteEvent
 */

/**
 * @param {string} clipId
 * @param {Array<ClipNoteEvent>} clipEvents
 * @param {number} laneIndex
 * @param {number} loopStart
 * @param {number} loopEnd
 * @param {number} totalSteps
 * @returns {HTMLDivElement}
 */
export function renderLane(
  clipId,
  clipEvents,
  laneIndex,
  loopStart,
  loopEnd,
  totalSteps,
) {
  const activeStepSet = getActiveStepsForLane(clipEvents, laneIndex);
  const durations = new Map();
  for (const entry of getStepsForLane(clipEvents, laneIndex)) {
    durations.set(entry.step, entry.duration);
  }
  const laneDiv = document.createElement("div");
  laneDiv.className = "lane";
  laneDiv.dataset.lane = String(laneIndex);
  laneDiv.setAttribute("role", "row");

  let nextValidIndex = 0;
  for (let index = 0; index < totalSteps; index++) {
    const isDisabled =
      nextValidIndex > index || index < loopStart || index >= loopEnd;

    const isActive = activeStepSet.has(index);
    const durationBeats = durations.get(index) || 0.25;
    const durationSteps = durationBeats * STEPS_PER_BEAT;
    if (nextValidIndex === index) nextValidIndex = index + durationSteps;

    const gridCell = document.createElement("div");
    gridCell.setAttribute("role", "gridcell");
    setCellColumnStyleForStepAndDuration(gridCell, index, durationSteps);
    gridCell.style.gridRow = `1`;
    gridCell.style.visibility = isDisabled ? "hidden" : "visible";

    const button = document.createElement("button");
    button.classList.add("step");
    button.dataset.step = String(index);
    button.dataset.lane = String(laneIndex);
    button.dataset.clipId = clipId;
    if (isActive) {
      button.dataset.duration = durationBeats;
    }
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.setAttribute(
      "aria-label",
      getStepAriaLabel(laneIndex, index + 1, isActive, durationBeats),
    );

    gridCell.appendChild(button);
    laneDiv.appendChild(gridCell);
  }
  return laneDiv;
}

/**
 *
 * @param {string} clipId
 * @param {ClipNoteEvent[]} clipEvents
 * @param {number} laneIndex
 * @param {number} loopStart
 * @param {number} loopEnd
 */
export function updateLaneCells(
  clipId,
  clipEvents,
  laneIndex,
  loopStart,
  loopEnd,
) {
  const lane = document.querySelector(
    `.sequencer-lanes[data-clip-id="${clipId}"] .lane[data-lane="${laneIndex}"]`,
  );
  const cells = lane.querySelectorAll("[role=gridcell]");
  const durations = new Map();
  for (const entry of getStepsForLane(clipEvents, laneIndex)) {
    durations.set(entry.step, entry.duration);
  }

  let nextValidIndex = 0;
  cells.forEach((cell, index) => {
    const isDisabled =
      nextValidIndex > index || index < loopStart || index >= loopEnd;
    const durationBeats = durations.get(index) || 0.25;
    const durationSteps = durationBeats * STEPS_PER_BEAT;
    cell.style.visibility = isDisabled ? "hidden" : "visible";
    setCellColumnStyleForStepAndDuration(cell, index, durationSteps);
    const isActive = durations.get(index) !== null;
    if (!isActive) {
      cell.querySelector("button").dataset.duration = "";
    }
    if (index === nextValidIndex) {
      nextValidIndex += durationSteps;
    }
  });
}

function setCellColumnStyleForStepAndDuration(
  cell,
  startStep,
  durationInSteps,
) {
  cell.style.setProperty("--column-start", startStep + 1);
  cell.style.setProperty("--column-end", startStep + 1 + durationInSteps);
}

/**
 *
 * @param {ClipNoteEvent[]} clipEvents
 * @param {number} lane
 * @returns {Set<number}
 */
function getActiveStepsForLane(clipEvents, lane) {
  const steps = new Set();
  clipEvents.forEach((e) => {
    if (e.data.lane === lane) steps.add(e.data.step);
  });
  return steps;
}

/**
 * @param {ClipNoteEvent[]>} clipEvents
 * @param {number} lane
 * @returns {{step: number, duration: number}[]}
 */
function getStepsForLane(clipEvents, lane) {
  /** @type {Map<string,ClipNoteEvent}>} */
  const startEvents = new Map();
  /** @type {{step:number, duration:number}[]} */
  const result = [];

  for (const evt of clipEvents) {
    if (!evt || !evt.data || evt.data.lane !== lane) continue;
    if (evt.stage === NoteEventStage.Start) {
      startEvents.set(evt.noteId, evt);
    } else if (evt.stage === NoteEventStage.End) {
      const start = startEvents.get(evt.noteId);
      if (start) {
        const durationBeats = Math.max(0, evt.beatTime - start.beatTime);
        result.push({ step: start.data.step, duration: durationBeats });
        startEvents.delete(evt.noteId);
      }
    }
  }

  return result;
}

/**
 * @param {string} clipId
 * @param {ClipData[]} clipData
 * @param {number[]} laneRange
 * @param {number} loopStart start step
 * @param {number} loopEnd end step
 * @param {number} totalSteps total steps
 * @returns {HTMLDivElement}
 */
export function renderLanes(
  clipId,
  clipData,
  laneRange,
  loopStart,
  loopEnd,
  totalSteps,
) {
  const sequencerLanesElement = document.createElement("div");
  sequencerLanesElement.classList.add("sequencer-lanes");
  sequencerLanesElement.setAttribute("role", "grid");
  sequencerLanesElement.setAttribute("aria-label", "Sequencer grid");
  sequencerLanesElement.dataset.clipId = clipId;

  const lanes = Array.from(
    { length: Math.abs(laneRange[1] - laneRange[0]) },
    (_, i) =>
      renderLane(
        clipId,
        clipData.events,
        laneRange[1] - i,
        loopStart,
        loopEnd,
        totalSteps,
      ),
  );

  sequencerLanesElement.append(...lanes);
  return sequencerLanesElement;
}

/**
 * @param {string} clipId
 * @param {number} clipStart
 * @param {number} loopStart
 * @param {number} loopEnd
 * @param {number} totalSteps
 * @returns {HTMLDivElement}
 */
export function renderPlayheadLane(
  clipId,
  clipStart,
  loopStart,
  loopEnd,
  totalSteps,
) {
  const playheadLane = document.createElement("div");
  playheadLane.classList.add("lane", "playhead-lane");
  for (let index = 0; index < totalSteps; index++) {
    const isActive =
      index === loopStart && clipStart === loopStart ? "true" : "false";
    const isDisabled = index < loopStart || index >= loopEnd;
    const div = document.createElement("div");
    div.classList.add("playhead-step");
    div.dataset.clipId = clipId;
    div.dataset.lane = String(-1);
    div.dataset.active = isActive;
    div.dataset.step = String(index);
    div.style.visibility = isDisabled ? "hidden" : "visible";
    playheadLane.append(div);
  }
  return playheadLane;
}

/**
 * @param {string} clipId
 * @param {number} initialStartValue
 * @param {number} maxStartValue
 * @param {number} initialEndValue
 * @param {number} maxEndValue
 * @returns {HTMLDivElement}
 */
export function renderClipControls(
  clipId,
  initialStartValue,
  maxStartValue,
  initialEndValue,
  maxEndValue,
) {
  const createLabel = (visibleLabel, name, max, value, isStart) => {
    const label = document.createElement("label");
    const labelSpan = document.createElement("span");
    labelSpan.innerHTML = visibleLabel;
    label.appendChild(labelSpan);
    const input = document.createElement("input");
    input.dataset.clipId = clipId;
    input.classList.add("step-range");
    input.dataset.start = String(isStart);
    input.name = name;
    input.type = "number";
    input.min = "1";
    input.max = `${max}`;
    input.value = `${value}`;
    label.appendChild(input);
    return label;
  };

  const startLabel = createLabel(
    "Start step: ",
    "start step",
    maxStartValue,
    initialStartValue,
    true,
  );
  const endLabel = createLabel(
    "End step: ",
    "end step",
    maxEndValue,
    initialEndValue,
    false,
  );

  const controlsDiv = document.createElement("div");
  controlsDiv.classList.add("controls");
  controlsDiv.append(startLabel, endLabel);

  return controlsDiv;
}

/**
 * @returns {HTMLDivElement}
 */
export function renderPlayControls() {
  const playStop = document.createElement("button");
  playStop.id = "play-stop";
  playStop.classList.add("play-stop");
  playStop.innerHTML = "Play";

  const tempo = document.createElement("label");
  tempo.classList.add("label");
  const tempoSpan = document.createElement("span");
  tempoSpan.innerHTML = "Tempo";
  tempo.appendChild(tempoSpan);

  const tempoSlider = document.createElement("input");
  tempoSlider.type = "range";
  tempoSlider.name = "tempo";
  tempoSlider.id = "tempo";
  tempoSlider.min = "20";
  tempoSlider.max = "300";
  tempoSlider.value = "100";
  tempo.appendChild(tempoSlider);

  const controlsDiv = document.createElement("div");
  controlsDiv.classList.add("controls");
  controlsDiv.append(playStop, tempo);

  return controlsDiv;
}

/**
 * @param {number[]} durations
 * @returns {HTMLDivElement}
 */
export function renderDurationRadio(durations) {
  const div = document.createElement("div");
  const fieldset = document.createElement("fieldset");
  fieldset.id = "duration-swatch";
  const legend = document.createElement("legend");
  legend.textContent = "Insert step durations:";
  fieldset.appendChild(legend);
  durations.forEach((d) => {
    const input = document.createElement("input");
    input.type = "radio";
    input.id = `dur-${d}`;
    input.name = "duration";
    input.value = String(d);
    if (d === 0.25) input.checked = true;
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.dataset.duration = String(d);
    label.textContent = String(d * STEPS_PER_BEAT);
    fieldset.append(input, label);
  });
  div.append(fieldset);
  return div;
}

/**
 * @param {number} lane
 * @param {number} step
 * @param {boolean} active
 * @param {number} duration
 * @returns {string}
 */
export function getStepAriaLabel(lane, step, active, duration) {
  const stepDuration = duration * STEPS_PER_BEAT;
  return `Step ${step}, Track ${lane}, ${
    active
      ? `Active, ${stepDuration} step${stepDuration === 1 ? "" : "s"}`
      : "Inactive"
  }`;
}

/**
 * @param {string} clipId
 * @param {number} lane
 * @param {number} step
 * @returns {HTMLButtonElement|undefined}
 */
function getButtonByClipData(clipId, lane, step) {
  return document.querySelector(
    `button[data-clip-id="${clipId}"][data-lane="${lane}"][data-step="${step}"]`,
  );
}

/**
 * @param {HTMLButtonElement} buttonElement
 * @returns {{step:number,lane:number}}
 */
function getLaneAndStepFromButton(buttonElement) {
  const stepAttribute = buttonElement.getAttribute("data-step");
  const laneAttribute = buttonElement.getAttribute("data-lane");
  if (stepAttribute === null || laneAttribute === null) {
    throw new Error("Could not find attributes");
  } else {
    return {
      step: parseInt(stepAttribute, 10),
      lane: parseInt(laneAttribute, 10),
    };
  }
}

/**
 * @param {string} clipId
 * @param {number} lane
 * @param {number} step
 * @param {boolean} isPlaying
 */
export function updateStepPlayState(clipId, lane, step, isPlaying) {
  const button = getButtonByClipData(clipId, lane, step);
  button?.setAttribute("data-playing", isPlaying ? "true" : "false");
}

/**
 * @param {string} clipId
 * @param {number} currentBeatTime
 */
export function updatePlayhead(clipId, currentBeatTime) {
  const playheadSteps = document.querySelectorAll(
    `.playhead-step[data-clip-id="${clipId}"]`,
  );
  const currentStep = Math.floor(currentBeatTime * STEPS_PER_BEAT);
  playheadSteps.forEach((v, i) => {
    v.setAttribute("data-active", i === currentStep ? "true" : "false");
  });
}

/**
 * @param {HTMLElement[]} htmlNodes
 * @param {import("./engine.js").EngineAPI} engine
 * @returns {{cleanup: () => void}}
 */
export function createView(htmlNodes, engine) {
  const appRoot = document.querySelector("#app");
  const abortController = new AbortController();
  const playControls = renderPlayControls(engine);
  const div = document.createElement("div");
  div.append(playControls, ...htmlNodes);

  if (appRoot) {
    appRoot.appendChild(div);
  }

  /** @type {HTMLButtonElement|null} */
  const playStopButton = document.querySelector("#play-stop");
  if (playStopButton) {
    playStopButton.addEventListener(
      "click",
      () => {
        togglePlayState(engine);
        const state = engine.transport.getState();
        playStopButton.innerHTML =
          state === TransportState.Stopped ? "Play" : "Stop";
        playStopButton.classList.toggle("active");
      },
      {
        signal: abortController.signal,
      },
    );
  }

  /** @type {HTMLInputElement|null} */
  const tempoSlider = document.querySelector("input#tempo");
  if (tempoSlider) {
    tempoSlider.addEventListener(
      "input",
      () => {
        setTempo(engine, parseInt(tempoSlider.value, 10));
      },
      {
        signal: abortController.signal,
      },
    );
  }

  const lengthInputs = document.querySelectorAll(".step-range");
  lengthInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const clipId = input.dataset.clipId;
    const isStart = input.dataset.start === "true";
    input.addEventListener(
      "input",
      () => {
        const step = parseInt(input.value, 10);
        const update = isStart ? { start: step - 1 } : { end: step };
        setClipActiveRange(engine, clipId, update);
        refreshAllLanesForClip(clipId);
      },
      {
        signal: abortController.signal,
      },
    );
  });

  /** @type {HTMLButtonElement[]} */
  const stepButtons = Array.from(document.querySelectorAll("button.step"));
  stepButtons.forEach((element) => {
    try {
      const { step, lane } = getLaneAndStepFromButton(element);
      const clipId = element.dataset["clipId"];
      element.addEventListener(
        "click",
        () => {
          onStepClick(clipId, lane, step, element);
        },
        {
          signal: abortController.signal,
        },
      );
    } catch {
      //
    }
  });

  let currentDuration = 0.25;
  /** @type {CurrentCell} */
  const currentCell = { step: 0, lane: 1, clipId: undefined };
  /**
   * @param {string} clipId
   * @param {number} lane
   * @param {number} step
   * @param {HTMLButtonElement} element
   */
  function onStepClick(clipId, lane, step, element) {
    toggleCell(engine, clipId, lane, step, currentDuration);
    const clip = engine.clipPlayer.getClip(clipId);
    updateLaneCells(
      clipId,
      clip.events,
      lane,
      clip.activeRangeStartBeatTime * STEPS_PER_BEAT,
      clip.activeRangeEndBeatTime * STEPS_PER_BEAT,
    );
    refreshLaneButtonStates(clipId, lane, clip.events);
    currentCell.lane = lane;
    currentCell.step = step;
    currentCell.clipId = clipId;
    element.focus();
  }

  /**
   * @param {string} clipId
   * @param {number} lane
   * @param {ClipNoteEvent[]} clipEvents
   */
  function refreshLaneButtonStates(clipId, lane, clipEvents) {
    const activeSteps = getActiveStepsForLane(clipEvents, lane);
    const durations = new Map();
    for (const entry of getStepsForLane(clipEvents, lane)) {
      durations.set(entry.step, entry.duration);
    }
    const buttons = document.querySelectorAll(
      `button.step[data-clip-id="${clipId}"][data-lane="${lane}"]`,
    );
    buttons.forEach((btn) => {
      const stepAttr = btn.getAttribute("data-step");
      if (stepAttr == null) return;
      const stepIndex = parseInt(stepAttr, 10);
      const isActive = activeSteps.has(stepIndex);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      if (isActive) {
        const durationBeats = durations.get(stepIndex) || 0.25;
        btn.setAttribute(
          "aria-label",
          `${getStepAriaLabel(lane, stepIndex + 1, true, durationBeats)}`,
        );
        btn.dataset.duration = durationBeats;
      } else {
        btn.setAttribute(
          "aria-label",
          getStepAriaLabel(lane, stepIndex + 1, false, 0),
        );
        btn.removeAttribute("data-duration");
        btn.removeAttribute("data-playing");
      }
    });
  }

  /**
   * @param {string} clipId
   */
  function refreshAllLanesForClip(clipId) {
    const clip = engine.clipPlayer.getClip(clipId);
    if (!clip) return;
    const container = document.querySelector(
      `.sequencer-lanes[data-clip-id="${clipId}"]`,
    );
    if (!container) return;
    const loopStart = clip.activeRangeStartBeatTime * STEPS_PER_BEAT;
    const loopEnd = clip.activeRangeEndBeatTime * STEPS_PER_BEAT;
    container.querySelectorAll(".lane[data-lane]").forEach((laneEl) => {
      const laneIndex = parseInt(laneEl.getAttribute("data-lane"), 10);
      updateLaneCells(clipId, clip.events, laneIndex, loopStart, loopEnd);
      refreshLaneButtonStates(clipId, laneIndex, clip.events);
    });
    document
      .querySelectorAll(`.playhead-step[data-clip-id="${clipId}"]`)
      .forEach((el, index) => {
        const visible = index >= loopStart && index < loopEnd;
        el.style.visibility = visible ? "visible" : "hidden";
        if (!visible && el.getAttribute("data-active") === "true") {
          el.setAttribute("data-active", "false");
        }
      });
  }

  const durationRadioGroup = document.querySelector("#duration-swatch");
  durationRadioGroup?.addEventListener("input", (e) => {
    if (e.target && e.target instanceof HTMLInputElement) {
      currentDuration = parseFloat(e.target.value);
    }
  });

  document.querySelectorAll(".sequencer-lanes").forEach((element) => {
    const clipId = element.dataset.clipId;

    /**
     * @param {number} lane
     * @param {number} step
     * @returns {boolean}
     */
    function moveTo(lane, step) {
      const tgt = element.querySelector(
        `button[data-lane="${lane}"][data-step="${step}"]`,
      );
      if (!(tgt instanceof HTMLButtonElement)) {
        return false;
      }
      stepButtons.forEach((button) => {
        if (button.dataset.clipId === clipId) button.tabIndex = -1;
      });
      if (tgt) {
        tgt.tabIndex = 0;
        tgt.focus();
        currentCell.lane = lane;
        currentCell.step = step;
        currentCell.clipId = clipId;
      }
      return true;
    }

    element.addEventListener(
      "keydown",
      (event) => {
        let hasMoved = false;
        const currentClip = engine.clipPlayer.getClip(clipId);
        const minStep = currentClip.activeRangeStartBeatTime * STEPS_PER_BEAT;
        const maxStep = currentClip.activeRangeEndBeatTime * STEPS_PER_BEAT - 1;
        const target = event.target;
        const step = parseInt(target.dataset.step, 10);
        const lane = parseInt(target.dataset.lane, 10);

        switch (event.key) {
          case "ArrowRight": {
            const nextStep = Math.max(minStep, Math.min(maxStep, step + 1));
            if (step !== nextStep) hasMoved = moveTo(lane, nextStep);
            event.preventDefault();
            break;
          }
          case "ArrowLeft": {
            const nextStep = Math.max(minStep, Math.min(maxStep, step - 1));
            if (step !== nextStep) hasMoved = moveTo(lane, nextStep);
            event.preventDefault();
            break;
          }
          case "ArrowDown":
            hasMoved = moveTo(lane - 1, step);
            event.preventDefault();
            break;
          case "ArrowUp":
            hasMoved = moveTo(lane + 1, step);
            event.preventDefault();
            break;
          case "Enter": {
            if (currentCell.clipId) {
              const button = getButtonByClipData(
                currentCell.clipId,
                currentCell.lane,
                currentCell.step,
              );
              if (button) {
                onStepClick(currentCell.clipId, lane, step, button);
                event.preventDefault();
              }
            }
            break;
          }
        }
        if (hasMoved) {
          engine.auditionSynth(mtof(60 + currentCell.lane));
        }
      },
      {
        signal: abortController.signal,
      },
    );
  });

  function cleanup() {
    if (abortController) {
      abortController.abort();
    }
  }

  return { cleanup };
}
