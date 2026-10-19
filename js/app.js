
import {
  DEFAULT_START,
  DEFAULT_DESTINATION,
  DISCLAIMER,
} from "./demo-data.js";

import { findRoutes } from "./routing.js";

import {
  initMap,
  showRoute,
} from "./map.js";

const startInput = document.querySelector("#start");
const destinationInput = document.querySelector("#destination");
const form = document.querySelector("#route-form");
const results = document.querySelector("#results");
const fastestTime = document.querySelector("#fastest-time");
const fastestDistance = document.querySelector("#fastest-distance");
const safetyTime = document.querySelector("#safety-time");
const safetyDistance = document.querySelector("#safety-distance");
const safetyExtra = document.querySelector("#safety-extra");
const avoidedList = document.querySelector("#avoided-list");
const explanation = document.querySelector("#explanation");
const altNote = document.querySelector("#alt-note");
const disclaimer = document.querySelector("#disclaimer");
const status = document.querySelector("#status");

startInput.value = DEFAULT_START;
destinationInput.value = DEFAULT_DESTINATION;
disclaimer.textContent = DISCLAIMER;

initMap(document.querySelector("#map"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const start = startInput.value.trim();
  const destination = destinationInput.value.trim();
  const preference = form.elements.preference.value;

  if (!start || !destination) return;

  if (status) {
    status.hidden = false;
    status.textContent =
      "Finding routes and analyzing historical collision data...";
  }

  results.hidden = true;

  try {
    const result = await findRoutes({
      start,
      destination,
      preference,
    });

    renderResults(result);

    if (status) status.hidden = true;
    results.hidden = false;
  } catch (error) {
    console.error("SafeRoute error:", error);

    if (status) {
      status.hidden = false;
      status.textContent =
        error.message ||
        "Something went wrong while finding the route.";
    }

    results.hidden = true;
  }
});

function renderResults(result) {
  const { fastest, safety, alternativesAvailable } = result;

  fastestTime.textContent = `${fastest.minutes} min`;
  fastestDistance.textContent = `${fastest.miles} mi`;

  safetyTime.textContent = `${safety.minutes} min`;
  safetyDistance.textContent = `${safety.miles} mi`;

  const extraMinutes = Math.max(
    0,
    safety.minutes - fastest.minutes
  );

  safetyExtra.textContent =
    extraMinutes === 0
      ? "Same estimated travel time as fastest route"
      : `${extraMinutes} min slower than fastest`;

  altNote.hidden = false;
  altNote.textContent = alternativesAvailable
    ? "SafeRoute compared multiple real road routes using historical collision exposure."
    : "No alternative route was returned for comparison. The app cannot establish that a different route is safer.";

  avoidedList.innerHTML = "";

  const fastestCrashes = fastest.crashCount;
  const safetyCrashes = safety.crashCount;

  const riskItem = document.createElement("li");

  if (
    fastestCrashes != null &&
    safetyCrashes != null &&
    fastest.miles > 0 &&
    safety.miles > 0
  ) {
    const fastestPerMile = fastestCrashes / fastest.miles;
    const safetyPerMile = safetyCrashes / safety.miles;
    const difference = fastestPerMile - safetyPerMile;

    const formatRate = (rate) =>
      rate.toLocaleString("en-US", {
        maximumFractionDigits: 1,
      });

    let comparison;

    if (difference > 0) {
      const percent = fastestPerMile > 0
        ? Math.round((difference / fastestPerMile) * 100)
        : 0;

      comparison =
        `The safety route has about ${formatRate(difference)} fewer nearby historical collisions per mile (${percent}% lower by this rough measure).`;
    } else if (difference < 0) {
      const percent = safetyPerMile > 0
        ? Math.round((Math.abs(difference) / safetyPerMile) * 100)
        : 0;

      comparison =
        `The safety route has about ${formatRate(Math.abs(difference))} more nearby historical collisions per mile (${percent}% higher by this rough measure).`;
    } else {
      comparison =
        "Both routes have the same calculated historical collision count per mile.";
    }

    riskItem.innerHTML = `
      <strong>Fastest route: ${fastestCrashes.toLocaleString()} nearby historical collisions</strong>
      <span>Distance: ${fastest.miles} mi · Approx. ${formatRate(fastestPerMile)} collisions per mile</span>
      <br>
      <strong>Safety route: ${safetyCrashes.toLocaleString()} nearby historical collisions</strong>
      <span>Distance: ${safety.miles} mi · Approx. ${formatRate(safetyPerMile)} collisions per mile</span>
      <br>
      <span>${comparison}</span>
      <br>
      <span>These are approximate counts near each route, divided by route distance—not a validated safety score. Historical data cannot guarantee current road safety.</span>
    `;

    explanation.textContent =
      `The app compares both total nearby historical collision counts and approximate counts per mile. The per-mile comparison accounts for route length, but it cannot establish which route is objectively safest. Consider the travel time, route details, and these limitations before choosing.`;
  } else {
    riskItem.innerHTML = `
      <strong>Historical collision comparison unavailable</strong>
      <span>One or both routes are missing valid collision counts or distance data. SafeRoute cannot make a reliable comparison for this trip.</span>
    `;

    explanation.textContent =
      "The app could not calculate a complete comparison because valid collision counts or route distances were unavailable. It should not claim that one route is safer.";
  }

  avoidedList.appendChild(riskItem);

  showRoute(result);
}
