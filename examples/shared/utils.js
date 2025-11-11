/**
 * @param {number} step
 * @param {number} beatsPerStep
 * @returns {number}
 */
export function stepToBeatTime(step, beatsPerStep) {
  return step * beatsPerStep;
}

/**
 * @param {number} midi
 * @returns {number}
 */
export function mtof(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
