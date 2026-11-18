/* THE PAGE: event → model rule → new state → visual feedback.
 * Read model.js for the rules. This file connects those rules to HTML.
 * No libraries, accounts, or installation are needed.
 */
"use strict";

const toaster = new ToasterModel();
const shadeNames = ["Very light", "Light", "Medium", "Medium-dark", "Dark"];
const reactions = [
  [["uneasy", "A little pale for me."], ["slightly-impatient", "A little longer would’ve been nice."], ["impatient", "Already? I wanted a little longer!"]],
  [["smile", "I’ll be here when you’re ready."], ["comfortable", "Just how I like it."], ["grin", "Perfect timing!"]],
  [["worried", "Maybe I stayed in too long."], ["disappointed", "A little darker than I hoped."], ["dismayed", "Oh no, I wanted a lighter toast!"]]
];
const reactionBackgrounds = {
  smile: "#FFF8E7",
  comfortable: "#FFF2CC",
  grin: "#F3E3A6",
  uneasy: "#FFF1E8",
  "slightly-impatient": "#F8DDC8",
  impatient: "#EDC7A5",
  worried: "#EDF1F5",
  disappointed: "#DDE6EF",
  dismayed: "#C4D3E2",
  surprised: "#E8DFF0"
};
const shadeByLevel = [0, 0, 1, 2, 2];
let cycleExpectations = null;
let hasFinishedCycle = false;
const hungerNames = ["Not very hungry", "Moderately hungry", "Very hungry"];
const ui = {
  comparison: document.querySelector("#result-comparison"),
  resultPreferred: document.querySelector("#result-preferred"),
  resultActual: document.querySelector("#result-actual"),
  resultHunger: document.querySelector("#result-hunger"),
  retry: document.querySelector("#retry-prompt"),
  preference: document.querySelector("#preferred-shade"),
  hunger: document.querySelector("#hunger"),
  face: document.querySelector("#toast-face"),
  opinion: document.querySelector("#toast-opinion"),
  insert: document.querySelector("#insert-button"),
  remove: document.querySelector("#remove-button"),
  lever: document.querySelector("#lever-button"),
  cancel: document.querySelector("#cancel-button"),
  knob: document.querySelector("#browning-knob"),
  levelOutput: document.querySelector("#level-output"),
  appliance: document.querySelector("#appliance"),
  state: document.querySelector("#state-name"),
  heat: document.querySelector("#heat-label"),
  remaining: document.querySelector("#time-remaining"),
  progress: document.querySelector("#cycle-progress"),
  feedback: document.querySelector("#feedback"),
  levelNote: document.querySelector("#level-note"),
  preview: document.querySelector("#preview-toast"),
  slot: document.querySelector("#slot-toast"),
  needle: document.querySelector("#dial-needle")
};

// Timer bookkeeping is separate from the model's state variables.
let timerId = null;
let lastTick = 0;
// Keep the knob moving forward, including the transition from level 5 to 1.
let knobSteps = 2; // Initial level 3 is two clicks after level 1.

// Mix three aligned toast images continuously, rather than suddenly changing
// pictures. 6 seconds reaches reference 1; 12 reaches 3; 18 reaches 5.
// At 9 and 15 seconds, a 50/50 mix creates the missing levels 2 and 4.
function renderBrowning(progress) {
  const heatedSeconds = progress / 100 * 18;
  const medium = Math.min(1, Math.max(0, (heatedSeconds - 6) / 6));
  const dark = Math.min(1, Math.max(0, (heatedSeconds - 12) / 6));
  const rawness = 1 - Math.min(1, heatedSeconds / 6);
  [ui.slot, ui.preview].forEach((slice) => {
    slice.style.setProperty("--medium", medium);
    slice.style.setProperty("--dark", dark);
    slice.style.setProperty("--raw-filter", `brightness(${1 + rawness * 0.07}) saturate(${1 - rawness * 0.35})`);
  });
}

function render(state) {
  const isToasting = state.currentState === "Toasting";
  const isFinished = state.currentState === "Done" || state.currentState === "Cancelled";
  ui.appliance.dataset.state = state.currentState;
  ui.state.textContent = state.currentState;
  ui.heat.textContent = isToasting ? "heating on" : "heating off";
  ui.insert.disabled = state.breadPresent;
  ui.remove.disabled = !state.breadPresent || isToasting;
  ui.knob.disabled = isToasting;
  ui.levelOutput.textContent = `${state.browningLevel} / ${shadeNames[state.browningLevel - 1]}`;
  const nextLevel = state.browningLevel === 5 ? 1 : state.browningLevel + 1;
  ui.knob.setAttribute("aria-label", `Browning level ${state.browningLevel}. Click to select level ${nextLevel}.`);
  ui.knob.style.setProperty("--knob-angle", `${knobSteps * 72}deg`);
  ui.needle.style.transform = `rotate(${(state.browningLevel - 3) * 26}deg)`;

  const seconds = Math.ceil(state.timeRemaining);
  ui.remaining.textContent = String(seconds).padStart(2, "0");
  ui.remaining.setAttribute("aria-label", `${seconds} seconds remaining`);
  ui.progress.value = state.cycleProgress;
  ui.preview.style.opacity = state.breadPresent ? "1" : ".4";
  renderBrowning(state.browningProgress);
  ui.preference.disabled = isToasting;
  ui.hunger.disabled = isToasting;

  let expression = "";
  let opinion = "";
  if (state.currentState === "Cancelled") {
    [expression, opinion] = ["surprised", "An early exit!"];
  } else if (state.currentState === "Done") {
    const difference = cycleExpectations.shade - cycleExpectations.preferred;
    [expression, opinion] = reactions[Math.sign(difference) + 1][cycleExpectations.hunger];
  }
  if (isFinished) {
    hasFinishedCycle = true;
    ui.resultPreferred.textContent = ["Light toast", "Medium toast", "Dark toast"][cycleExpectations.preferred];
    // Report the shade reached through heating, including an interrupted cycle.
    const heatedSeconds = Math.round(state.browningProgress / 100 * 18 * 1000) / 1000;
    const actualShade = heatedSeconds < 6 ? "Barely toasted" : heatedSeconds < 10.5 ? "Light toast" : heatedSeconds < 13.5 ? "Medium toast" : "Dark toast";
    ui.resultActual.textContent = state.currentState === "Cancelled" ? actualShade + " (cancelled early)" : actualShade;
    ui.resultHunger.textContent = hungerNames[cycleExpectations.hunger];
  }
  ui.comparison.hidden = !isFinished;
  ui.retry.hidden = !hasFinishedCycle;
  document.body.style.backgroundColor = reactionBackgrounds[expression] || "";
  ui.face.hidden = !expression;
  ui.face.dataset.expression = expression;
  ui.opinion.dataset.expression = expression;
  if (ui.opinion.textContent !== opinion) ui.opinion.textContent = opinion;

  // Avoid announcing the same message on every 50ms timer tick.
  if (ui.feedback.textContent !== state.message) ui.feedback.textContent = state.message;
  ui.levelNote.textContent = isToasting ? "Knob locked while toasting." : isFinished ? "Click the knob to choose your next slice’s level." : "Click the brown knob to change level: 1 → 5 → 1.";

  document.querySelectorAll(".state-path li").forEach((item) => {
    if (item.dataset.state === state.currentState) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
  document.querySelectorAll(".shade-samples li").forEach((sample) => {
    sample.classList.toggle("selected", Number(sample.dataset.level) === state.browningLevel);
  });
}

function stopClock() {
  clearInterval(timerId);
  timerId = null;
}

// Use elapsed clock time, not "one tick = one second". If a browser delays a
// tick in another tab, the countdown catches up instead of running slowly.
function tick() {
  const now = performance.now();
  const elapsedSeconds = (now - lastTick) / 1000;
  lastTick = now;
  const state = toaster.advance(elapsedSeconds);
  render(state);
  if (state.currentState !== "Toasting") stopClock();
}

function startClock() {
  // Repeated lever presses must never create a second clock.
  if (timerId !== null) return;
  lastTick = performance.now();
  timerId = setInterval(tick, 50);
}

// Events are things the visitor does. Each listener connects one event to
// one rule, then redraws the page from the resulting state.
ui.insert.addEventListener("click", () => render(toaster.insertBread()));
ui.remove.addEventListener("click", () => render(toaster.removeBread()));
// A click is one step. After 5, return to 1. Native button behavior also
// allows keyboard users to select a shade with Enter or Space.
ui.knob.addEventListener("click", () => {
  const level = toaster.getState().browningLevel;
  const nextLevel = level === 5 ? 1 : level + 1;
  knobSteps += 1;
  render(toaster.setLevel(nextLevel));
});
ui.hunger.addEventListener("input", () => {
  ui.hunger.setAttribute("aria-valuetext", hungerNames[Number(ui.hunger.value)]);
});
ui.lever.addEventListener("click", () => {
  if (timerId !== null) tick();
  const wasReady = toaster.getState().currentState === "Ready";
  const state = toaster.pressLever();
  if (wasReady) {
    cycleExpectations = {
      preferred: Number(ui.preference.querySelector(":checked").value),
      hunger: Number(ui.hunger.value),
      shade: shadeByLevel[state.browningLevel - 1]
    };
  }
  render(state);
  if (state.currentState === "Toasting") startClock();
});
ui.cancel.addEventListener("click", () => {
  // Include the fraction of a second since the last tick before freezing.
  if (timerId !== null) tick();
  const state = toaster.cancel();
  if (state.currentState !== "Toasting") stopClock();
  render(state);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && timerId !== null) tick();
});

// The page starts by showing the initial variables from the model.
render(toaster.getState());
