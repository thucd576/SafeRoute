import {
  DEFAULT_START,
  DEFAULT_DESTINATION,
  DISCLAIMER,
} from "./demo-data.js";

import { findRoutes } from "./routing.js";
import { initMap, showRoute, clearMap } from "./map.js";

const startInput = document.querySelector("#start");
const destinationInput = document.querySelector("#destination");
const form = document.querySelector("#route-form");
const results = document.querySelector("#results");
const emptyState = document.querySelector("#empty-state");
const status = document.querySelector("#status");
const disclaimer = document.querySelector("#disclaimer");
const altNote = document.querySelector("#alt-note");

const fastestTime = document.querySelector("#fastest-time");
const fastestDistance = document.querySelector("#fastest-distance");
const safetyTime = document.querySelector("#safety-time");
const safetyDistance = document.querySelector("#safety-distance");
const safetyExtra = document.querySelector("#safety-extra");
const fastestCollisions = document.querySelector("#fastest-collisions");
const safetyCollisions = document.querySelector("#safety-collisions");
const fastestExtra = document.querySelector("#fastest-extra");
const fastestRate = document.querySelector("#fastest-rate");
const safetyRate = document.querySelector("#safety-rate");
const safetyRateDiff = document.querySelector("#safety-rate-diff");
const safetyBadges = document.querySelector("#safety-badges");
const safetyDetails = document.querySelector("#safety-details");
const safetyEmpty = document.querySelector("#safety-empty");
const safetySelectButton = document.querySelector("#safety-select");

const avoidedList = document.querySelector("#avoided-list");
const explanation = document.querySelector("#explanation");

const timeLimitInput = document.querySelector("#time-limit");
const coachRecommendation = document.querySelector("#coach-recommendation");
const coachReasons = document.querySelector("#coach-reasons");
const confidenceNote = document.querySelector("#confidence-note");
const approveButton = document.querySelector("#approve-route");
const chooseButton = document.querySelector("#choose-route");
const approvalStatus = document.querySelector("#approval-status");
const decisionSteps = document.querySelector("#decision-steps");

const demoBanner = document.querySelector("#demo-banner");
const selectedLabel = document.querySelector("#selected-label");

// If every route has fewer recorded collisions than this, the area is
// probably outside the City of Los Angeles data, so SafeRoute does not
// compare routes. (A judgment call for this prototype, not a statistical rule.)
const MIN_COLLISIONS_FOR_COMPARISON = 25;

let latestResult = null;
let recommendedRoute = null;
let currentPreference = "balanced";

startInput.value = DEFAULT_START;
destinationInput.value = DEFAULT_DESTINATION;

startInput.placeholder = "Street address, city, state";
destinationInput.placeholder = "Street address, city, state";

startInput.required = true;
destinationInput.required = true;

addAddressHint(
  startInput,
  "start-address-hint",
  "Include the street or place, city, and state."
);

addAddressHint(
  destinationInput,
  "destination-address-hint",
  "Include the street or place, city, and state."
);

disclaimer.textContent = DISCLAIMER;
initMap(document.querySelector("#map"));

if (demoBanner) demoBanner.hidden = true;

// Put a clear red error directly above the field that needs fixing.
function showFieldError(input, message) {
  const errorId = `${input.id}-error`;
  let error = document.getElementById(errorId);

  if (!error) {
    error = document.createElement("div");
    error.id = errorId;
    error.setAttribute("role", "alert");

    Object.assign(error.style, {
      display: "block",
      color: "#b42318",
      backgroundColor: "#fff0f0",
      border: "1px solid #e5a1a1",
      borderRadius: "8px",
      padding: "10px 12px",
      margin: "8px 0",
      fontSize: "0.9rem",
      fontWeight: "600",
      lineHeight: "1.45"
    });

    input.insertAdjacentElement("beforebegin", error);
  }

  error.textContent = `⚠ ${message}`;
  error.hidden = false;

  input.setAttribute("aria-invalid", "true");
  input.style.border = "2px solid #c62828";
  input.style.backgroundColor = "#fff8f8";

  const existingDescription = input.getAttribute("aria-describedby");
  const descriptionIds = existingDescription
    ? existingDescription.split(/\s+/).filter(Boolean)
    : [];

  if (!descriptionIds.includes(errorId)) {
    descriptionIds.push(errorId);
  }

  input.setAttribute("aria-describedby", descriptionIds.join(" "));
}

function clearFieldError(input) {
  const error = document.getElementById(`${input.id}-error`);

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }

  input.removeAttribute("aria-invalid");
  input.style.border = "";
  input.style.backgroundColor = "";

  const description = input.getAttribute("aria-describedby");

  if (description) {
    const remainingIds = description
      .split(/\s+/)
      .filter((id) => id && id !== `${input.id}-error`);

    if (remainingIds.length) {
      input.setAttribute("aria-describedby", remainingIds.join(" "));
    } else {
      input.removeAttribute("aria-describedby");
    }
  }
}

function clearAllFieldErrors() {
  clearFieldError(startInput);
  clearFieldError(destinationInput);
}

function addAddressHint(input, hintId, message) {
  let hint = document.getElementById(hintId);

  if (!hint) {
    hint = document.createElement("small");
    hint.id = hintId;
    hint.className = "input-hint";

    Object.assign(hint.style, {
      display: "block",
      marginTop: "7px",
      marginBottom: "12px",
      fontSize: "0.82rem",
      lineHeight: "1.5",
      color: "#687871"
    });

    input.insertAdjacentElement("afterend", hint);
  }

  hint.textContent = message;

  const existingDescription = input.getAttribute("aria-describedby");
  const descriptionIds = existingDescription
    ? existingDescription.split(/\s+/).filter(Boolean)
    : [];

  if (!descriptionIds.includes(hintId)) {
    descriptionIds.push(hintId);
  }

  input.setAttribute("aria-describedby", descriptionIds.join(" "));
}

// Check the address format before asking the routing service to process it.
function getAddressProblem(value) {
  const text = value.trim();

  if (!text) {
    return "Please enter this location.";
  }

  const parts = text.split(",").map((part) => part.trim());

  if (parts.length < 2) {
    return "City and state are missing. Add them after the address, for example: 3770 Keystone Avenue, Los Angeles, CA.";
  }

  const stateNames = [
    "alabama", "alaska", "arizona", "arkansas", "california",
    "colorado", "connecticut", "delaware", "florida", "georgia",
    "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas",
    "kentucky", "louisiana", "maine", "maryland", "massachusetts",
    "michigan", "minnesota", "mississippi", "missouri", "montana",
    "nebraska", "nevada", "new hampshire", "new jersey",
    "new mexico", "new york", "north carolina", "north dakota",
    "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
    "south carolina", "south dakota", "tennessee", "texas", "utah",
    "vermont", "virginia", "washington", "west virginia", "wisconsin",
    "wyoming"
  ];

  const lastPart = parts[parts.length - 1];

  const hasState =
    /^[A-Z]{2}$/i.test(lastPart) ||
    stateNames.includes(lastPart.toLowerCase());

  if (!hasState) {
    return "State is missing. Add a state abbreviation like CA or the full state name, such as California.";
  }

  if (parts.length === 2 && !parts[0]) {
    return "City is missing. Add the city before the state.";
  }

  if (parts.length >= 3 && !parts[parts.length - 2]) {
    return "City is missing. Add the city before the state.";
  }

  return "";
}

function setStatus(message) {
  if (!status) return;

  status.textContent = message;
  status.hidden = !message;
}

// Remove the red error for a field as soon as the user edits that field.
[startInput, destinationInput].forEach((input) => {
  input.addEventListener("input", () => {
    clearFieldError(input);

    if (status && !status.hidden) {
      setStatus("");
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const start = startInput.value.trim();
  const destination = destinationInput.value.trim();
  const preference = form.elements.preference.value;

  clearAllFieldErrors();

  const startProblem = getAddressProblem(start);
  const destinationProblem = getAddressProblem(destination);

  if (startProblem || destinationProblem) {
    // Each error appears above its own input.
    if (startProblem) {
      showFieldError(startInput, startProblem);
    }

    if (destinationProblem) {
      showFieldError(destinationInput, destinationProblem);
    }

    // Keep address errors beside the relevant inputs, not in the status panel.
    setStatus("");

    const firstInvalidInput = startProblem
      ? startInput
      : destinationInput;

    firstInvalidInput.focus();
    firstInvalidInput.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    results.hidden = true;
    return;
  }

  currentPreference = preference;
  setStatus("Finding routes and comparing historical collision data... This can take 10–20 seconds.");
  results.hidden = true;

  if (emptyState) emptyState.hidden = true;

  const submitButton = document.querySelector("#find-route-button");

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Analyzing routes…";
  }

  try {
    const result = await findRoutes({
      start,
      destination,
      preference
    });

    latestResult = result;

    const recommendation = makeRecommendation(
      result,
      preference,
      Number(timeLimitInput?.value ?? 10)
    );

    recommendedRoute = recommendation.route;

    renderResults(result, recommendation);
    showSelectedRoute(recommendedRoute);
    updateDataBanner(result);

    results.hidden = false;

    if (emptyState) emptyState.hidden = true;

    setStatus("");
  } catch (error) {
    console.error("SafeRoute error:", error);

    // Don't leave the previous trip's routes on the map.
    latestResult = null;
    recommendedRoute = null;
    clearMap();
    if (selectedLabel) selectedLabel.hidden = true;
    if (demoBanner) demoBanner.hidden = true;

    results.hidden = true;

    if (emptyState) emptyState.hidden = false;

    setStatus(
      error.message ||
      "SafeRoute couldn't find a route. Check your addresses and try again."
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML =
        'Find my route <span aria-hidden="true">→</span>';
    }
  }
});

// ---------- Route helpers ----------

function hasEnoughCollisionData(result) {
  const counts = (result?.routes || [])
    .map((route) => route.crashCount)
    .filter(Number.isFinite);

  return counts.length > 0 && Math.max(...counts) >= MIN_COLLISIONS_FOR_COMPARISON;
}

const LOW_DATA_MESSAGE =
  `Every route here has fewer than ${MIN_COLLISIONS_FOR_COMPARISON} recorded collisions nearby, which usually means the area is outside the City of Los Angeles collision data. SafeRoute can't compare these routes fairly.`;

function updateDataBanner(result) {
  if (!demoBanner) return;

  demoBanner.hidden = false;
  demoBanner.textContent = hasEnoughCollisionData(result)
    ? "Historical collision data loaded (City of LA)"
    : "Limited collision data for this area";
}

function isDetour(route) {
  return route?.source === "OSRM detour";
}

function isSameRoute(a, b) {
  return Boolean(a && b && a.id === b.id);
}

function makeRecommendation(result, preference, maxExtraMinutes) {
  const fastest = result.fastest;
  const balanced = result.balanced || fastest;

  // Consider every route the planner found, not just three of them.
  const allRoutes = Array.isArray(result.routes) && result.routes.length
    ? result.routes
    : [fastest, balanced, result.safety || fastest];

  const extraTime = (route) =>
    Math.max(0, route.minutes - fastest.minutes);

  const dataSufficient = hasEnoughCollisionData(result);

  const hasRiskData = (route) =>
    dataSufficient &&
    Number.isFinite(route.crashRisk) &&
    Number.isFinite(route.crashCount) &&
    route.miles > 0;

  const candidates = allRoutes.filter(
    (route, index, array) =>
      route &&
      array.findIndex((item) => item.id === route.id) === index &&
      extraTime(route) <= maxExtraMinutes
  );

  const tooSlow = allRoutes.filter(
    (route) => route && route.id !== fastest.id && extraTime(route) > maxExtraMinutes
  );

  let route = fastest;
  let reason = "";
  const reasons = [];

  if (preference === "fastest") {
    route = fastest;
    reason =
      "You prioritized travel time, so SafeRoute recommends the fastest available route.";

    reasons.push("Prioritizes estimated travel time.");
  } else if (preference === "safety") {
    const withData = candidates.filter(hasRiskData);

    if (withData.length) {
      route = withData.reduce((best, candidate) =>
        candidate.crashRisk < best.crashRisk ? candidate : best
      );

      reason =
        "This route has the lowest recorded historical collisions per mile among available routes within your time limit.";

      reasons.push(`Within your ${maxExtraMinutes}-minute extra-time limit.`);
      reasons.push(
        `Approximate historical collisions per mile: ${formatNumber(route.crashRisk)}.`
      );
    } else {
      route = fastest;
      reason = dataSufficient
        ? "No route within your time limit had usable collision data, so SafeRoute recommends the fastest route."
        : "There isn't enough recorded collision data for this area to compare routes, so SafeRoute recommends the fastest route.";

      reasons.push("A safety-focused comparison was not possible.");
    }
  } else {
    // Balanced: lowest collisions per mile among routes within the time limit.
    const withData = candidates.filter(hasRiskData);

    if (withData.length) {
      route = withData.reduce((best, candidate) =>
        candidate.crashRisk < best.crashRisk ? candidate : best
      );
    } else {
      route = fastest;
    }

    reason =
      "SafeRoute recommends this option as a compromise between travel time and available historical collision information.";

    reasons.push(`Maximum extra travel time: ${maxExtraMinutes} minutes.`);

    if (hasRiskData(route)) {
      reasons.push(
        `Approximate historical collisions per mile: ${formatNumber(route.crashRisk)}.`
      );
    }
  }

  if (preference !== "fastest" && isSameRoute(route, fastest) && tooSlow.length) {
    reasons.push(
      `${tooSlow.length === 1 ? "An alternative exists" : "Alternatives exist"} but would add more than ${maxExtraMinutes} minutes. Raise the time limit to compare ${tooSlow.length === 1 ? "it" : "them"}.`
    );
  }

  if (isDetour(route)) {
    reasons.push(
      "This is a detour route generated by SafeRoute, not one suggested by the routing service. It is drivable but may not be a route drivers normally take."
    );
  }

  if (!dataSufficient) {
    reasons.push(LOW_DATA_MESSAGE);
  } else if (!hasRiskData(route)) {
    reasons.push(
      "Usable collision data for this route is incomplete or unavailable."
    );
  }

  return { route, reason, reasons, maxExtraMinutes, preference };
}

function renderResults(result, recommendation) {
  const fastest = result.fastest;
  const safety = result.safety || fastest;
  const chosen = recommendation.route;
  const safetyIsFastest = isSameRoute(safety, fastest);
  const dataSufficient = hasEnoughCollisionData(result);

  // ----- Fastest card -----
  setText(fastestTime, `${fastest.minutes} min`);
  setText(fastestExtra, "Baseline for comparison");
  setText(fastestDistance, `${fastest.miles} mi`);
  setText(fastestCollisions, formatCollisionCount(fastest));
  setText(fastestRate, formatRate(fastest));

  // ----- Safety-focused card -----
  if (safetyBadges) safetyBadges.innerHTML = "";
  setText(safetyRateDiff, "");
  safetyRateDiff?.classList.remove("is-lower", "is-higher");

  if (safetyIsFastest || !dataSufficient) {
    if (safetyDetails) safetyDetails.hidden = true;

    if (safetyEmpty) {
      safetyEmpty.hidden = false;
      safetyEmpty.textContent = !dataSufficient
        ? LOW_DATA_MESSAGE
        : result.alternativesAvailable
        ? "No alternative had fewer recorded collisions per mile than the fastest route, so there is no safety-focused option for this trip. That does not mean the fastest route is safe."
        : "Only one distinct route was found for this trip, so there is no alternative to compare.";
    }

    if (safetySelectButton) safetySelectButton.disabled = true;
  } else {
    if (safetyDetails) safetyDetails.hidden = false;
    if (safetyEmpty) safetyEmpty.hidden = true;
    if (safetySelectButton) safetySelectButton.disabled = false;

    const extraMinutes = Math.max(0, safety.minutes - fastest.minutes);

    setText(safetyTime, `${safety.minutes} min`);
    setText(
      safetyExtra,
      extraMinutes === 0
        ? "Same estimated time as fastest"
        : `+${extraMinutes} min vs fastest`
    );
    setText(safetyDistance, `${safety.miles} mi`);
    setText(safetyCollisions, formatCollisionCount(safety));
    setText(safetyRate, formatRate(safety));

    if (
      safetyRateDiff &&
      Number.isFinite(fastest.crashRisk) &&
      Number.isFinite(safety.crashRisk) &&
      fastest.crashRisk > 0
    ) {
      const percent = Math.round(
        (fastest.crashRisk - safety.crashRisk) / fastest.crashRisk * 100
      );

      if (percent > 0) {
        safetyRateDiff.textContent = `${percent}% lower than fastest`;
        safetyRateDiff.classList.add("is-lower");
      } else if (percent < 0) {
        safetyRateDiff.textContent = `${Math.abs(percent)}% higher than fastest`;
        safetyRateDiff.classList.add("is-higher");
      }
    }

    if (extraMinutes > recommendation.maxExtraMinutes) {
      addBadge(`Exceeds your ${recommendation.maxExtraMinutes}-min limit`, "badge-warn");
    }

    if (isDetour(safety)) {
      addBadge("Detour generated by SafeRoute", "badge-info");
    }
  }

  if (altNote) {
    altNote.hidden = false;

    const generated = Number(result.generatedAlternativeCount) || 0;

    if (!result.alternativesAvailable) {
      altNote.textContent =
        "Only one distinct route was found for this trip, so there is nothing to compare. SafeRoute cannot establish that another route is safer.";
    } else if (generated > 0) {
      altNote.textContent =
        `The routing service offered few or no alternatives for this trip, so SafeRoute generated ${generated} detour ${generated === 1 ? "route" : "routes"} by routing through points beside the direct path. Detours are real drivable routes, but not necessarily ones a driver would normally choose.`;
    } else {
      altNote.textContent =
        "SafeRoute compared alternative routes from the routing service using historical collision data.";
    }
  }

  if (coachRecommendation) {
    coachRecommendation.textContent =
      `${recommendation.reason} Estimated travel time: ${chosen.minutes} minutes (${chosen.miles} miles).`;
  }

  if (coachReasons) {
    coachReasons.innerHTML = "";

    recommendation.reasons.forEach((reason) => {
      const item = document.createElement("div");
      item.className = "coach-reason";
      item.textContent = reason;
      coachReasons.appendChild(item);
    });
  }

  if (confidenceNote) {
    confidenceNote.textContent =
      "This is a rule-based recommendation, not a validated prediction of crash probability. Historical records may be incomplete and do not reflect current traffic, weather, or road conditions.";
  }

  if (approvalStatus) approvalStatus.hidden = true;

  if (decisionSteps) {
    decisionSteps.innerHTML = "";

    [
      "Retrieve available driving routes, adding detour routes if few alternatives are returned.",
      "Compare travel times, distances, and available collision data.",
      `Apply the ${recommendation.preference} preference and ${recommendation.maxExtraMinutes}-minute time limit.`,
      "Present the recommendation for human review."
    ].forEach((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      decisionSteps.appendChild(item);
    });
  }

  renderCollisionComparison(fastest, safety, dataSufficient);
  updateSelectedCard(chosen);
  updateSelectedLabel(chosen);
}

function renderCollisionComparison(fastest, safety, dataSufficient = true) {
  if (!avoidedList || !explanation) return;

  avoidedList.innerHTML = "";
  const item = document.createElement("li");

  if (!dataSufficient) {
    item.innerHTML = `
      <strong>Not enough collision data to compare</strong>
      <span>${LOW_DATA_MESSAGE}</span>
    `;
  } else if (isSameRoute(fastest, safety)) {
    item.innerHTML = `
      <strong>No lower-collision alternative</strong>
      <span>SafeRoute did not find a distinct route with fewer recorded collisions per mile for this trip, so there is no comparison to show. This does not mean the fastest route is safe; only that no alternative scored lower.</span>
    `;
  } else if (
    Number.isFinite(fastest.crashCount) &&
    Number.isFinite(safety.crashCount) &&
    fastest.miles > 0 &&
    safety.miles > 0
  ) {
    const fastestRate = fastest.crashCount / fastest.miles;
    const safetyRate = safety.crashCount / safety.miles;
    const difference = fastestRate - safetyRate;
    const safetyName = isDetour(safety)
      ? "Safety-focused route (SafeRoute detour)"
      : "Safety-focused route";

    let comparison;

    if (difference > 0) {
      const percent = fastestRate > 0
        ? Math.round(difference / fastestRate * 100)
        : 0;

      comparison =
        `The safety-focused route has approximately ${formatNumber(difference)} fewer nearby historical collisions per mile (${percent}% lower by this rough measure).`;
    } else if (difference < 0) {
      const percent = safetyRate > 0
        ? Math.round(Math.abs(difference) / safetyRate * 100)
        : 0;

      comparison =
        `The safety-focused route has approximately ${formatNumber(Math.abs(difference))} more nearby historical collisions per mile (${percent}% higher by this rough measure).`;
    } else {
      comparison =
        "Both routes have the same calculated historical collision count per mile.";
    }

    item.innerHTML = `
      <strong>Fastest route</strong>
      <span>${fastest.crashCount.toLocaleString()} nearby historical collisions · ${fastest.miles} mi · ${formatNumber(fastestRate)} per mile</span>
      <strong>${safetyName}</strong>
      <span>${safety.crashCount.toLocaleString()} nearby historical collisions · ${safety.miles} mi · ${formatNumber(safetyRate)} per mile</span>
      <span>${comparison}</span>
    `;
  } else {
    item.innerHTML = `
      <strong>Collision comparison unavailable</strong>
      <span>One or both routes are missing usable collision counts or distance data. SafeRoute cannot make a reliable comparison for this trip.</span>
    `;
  }

  avoidedList.appendChild(item);

  explanation.textContent =
    "These figures count historical collisions near each route and divide by route distance for a rough comparison. They do not establish actual crash probability or guarantee that a route is safer.";
}

function formatCollisionCount(route) {
  if (!Number.isFinite(route.crashCount)) {
    return "Unavailable";
  }

  return route.crashCount.toLocaleString();
}

function formatRate(route) {
  if (!Number.isFinite(route.crashRisk)) {
    return "Unavailable";
  }

  return formatNumber(route.crashRisk);
}

function setText(element, text) {
  if (element) element.textContent = text;
}

function addBadge(text, className) {
  if (!safetyBadges) return;

  const badge = document.createElement("span");
  badge.className = `badge ${className}`;
  badge.textContent = text;
  safetyBadges.appendChild(badge);
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 1
  });
}

function showSelectedRoute(route) {
  if (!latestResult || !route) return;

  showRoute({ ...latestResult, selected: route });
  updateSelectedCard(route);
  updateSelectedLabel(route);
}

function updateSelectedCard(route) {
  document.querySelectorAll(".route-card").forEach((card) => {
    const key = card.dataset.card;

    const selected =
      (key === "fastest" && route.id === latestResult?.fastest?.id) ||
      (key === "safety" && route.id === latestResult?.safety?.id);

    card.classList.toggle("is-selected", selected);
  });
}

function updateSelectedLabel(route) {
  if (!selectedLabel || !route) return;

  selectedLabel.hidden = false;
  selectedLabel.textContent =
    `Selected route · ${route.minutes} min · ${route.miles} mi`;
}

approveButton?.addEventListener("click", () => {
  if (!recommendedRoute) return;

  showSelectedRoute(recommendedRoute);

  if (approvalStatus) {
    approvalStatus.hidden = false;
    approvalStatus.textContent =
      "Recommendation accepted for this demo. No external navigation was started.";
  }
});

chooseButton?.addEventListener("click", () => {
  document.querySelector(".compare-heading")?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  if (approvalStatus) {
    approvalStatus.hidden = false;
    approvalStatus.textContent =
      "Choose a route option below. Your selection will update the map.";
  }
});

document.querySelectorAll("[data-select-route]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!latestResult) return;

    const route = button.dataset.selectRoute === "fastest"
      ? latestResult.fastest
      : latestResult.safety;

    if (!route) return;

    showSelectedRoute(route);

    if (approvalStatus) {
      approvalStatus.hidden = false;
      approvalStatus.textContent =
        `You selected the ${button.dataset.selectRoute === "fastest" ? "fastest" : "safety-focused"} route. The map now displays your choice.`;
    }
  });
});

// Re-run the recommendation (no new network requests) when the user
// changes the time limit or the "What matters most?" choice.
let updateMessageTimer = null;

function refreshRecommendation(message) {
  if (!latestResult) return;

  const recommendation = makeRecommendation(
    latestResult,
    currentPreference,
    Number(timeLimitInput?.value ?? 10)
  );

  recommendedRoute = recommendation.route;
  renderResults(latestResult, recommendation);
  showSelectedRoute(recommendedRoute);

  // Brief confirmation so the user can see something changed.
  setStatus(
    `${message} Recommended: ${recommendedRoute.minutes} min · ${recommendedRoute.miles} mi.`
  );

  clearTimeout(updateMessageTimer);
  updateMessageTimer = setTimeout(() => setStatus(""), 5000);
}

timeLimitInput?.addEventListener("change", () => {
  refreshRecommendation(
    `Updated for up to ${timeLimitInput.value} extra minutes.`
  );
});

form.addEventListener("change", (event) => {
  if (event.target.name !== "preference") return;

  currentPreference = event.target.value;

  const label =
    currentPreference.charAt(0).toUpperCase() + currentPreference.slice(1);

  refreshRecommendation(`Updated for the ${label} preference.`);
});
