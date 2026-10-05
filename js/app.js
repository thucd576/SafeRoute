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


/* ---------------------------------
   PAGE ELEMENTS
---------------------------------- */

const startInput =
  document.querySelector("#start");

const destinationInput =
  document.querySelector("#destination");

const form =
  document.querySelector("#route-form");

const results =
  document.querySelector("#results");

const fastestTime =
  document.querySelector("#fastest-time");

const fastestDistance =
  document.querySelector("#fastest-distance");

const safetyTime =
  document.querySelector("#safety-time");

const safetyDistance =
  document.querySelector("#safety-distance");

const safetyExtra =
  document.querySelector("#safety-extra");

const avoidedList =
  document.querySelector("#avoided-list");

const explanation =
  document.querySelector("#explanation");

const altNote =
  document.querySelector("#alt-note");

const disclaimer =
  document.querySelector("#disclaimer");

const status =
  document.querySelector("#status");


/* ---------------------------------
   DEFAULT VALUES
---------------------------------- */

startInput.value =
  DEFAULT_START;

destinationInput.value =
  DEFAULT_DESTINATION;

disclaimer.textContent =
  DISCLAIMER;


/* ---------------------------------
   INITIALIZE MAP
---------------------------------- */

initMap(
  document.querySelector("#map")
);


/* ---------------------------------
   FORM SUBMISSION
---------------------------------- */

form.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const start =
      startInput.value.trim();

    const destination =
      destinationInput.value.trim();

    const preference =
      form.elements.preference.value;


    if (
      !start ||
      !destination
    ) {
      return;
    }


    /*
     * Show loading message if the
     * status element exists.
     */

    if (status) {
      status.hidden = false;

      status.textContent =
        "Finding routes and analyzing historical collision data...";
    }


    results.hidden = true;


    try {
      const result =
        await findRoutes({
          start,
          destination,
          preference,
        });


      renderResults(
        result
      );


      if (status) {
        status.hidden = true;
      }


      results.hidden = false;

    } catch (error) {
      console.error(
        "SafeRoute error:",
        error
      );


      if (status) {
        status.hidden = false;

        status.textContent =
          error.message ||
          "Something went wrong while finding the route.";
      }

      results.hidden = true;
    }
  }
);


/* ---------------------------------
   RENDER RESULTS
---------------------------------- */

function renderResults(
  result
) {
  const {
    fastest,
    safety,
    selected,
    alternativesAvailable,
  } = result;


  /*
   * --------------------------------
   * FASTEST ROUTE
   * --------------------------------
   */

  fastestTime.textContent =
    `${fastest.minutes} min`;

  fastestDistance.textContent =
    `${fastest.miles} mi`;


  /*
   * --------------------------------
   * SAFETY ROUTE
   * --------------------------------
   */

  safetyTime.textContent =
    `${safety.minutes} min`;

  safetyDistance.textContent =
    `${safety.miles} mi`;


  /*
   * How much longer is the safety
   * route than the fastest route?
   */

  const extraMinutes =
    Math.max(
      0,
      safety.minutes -
        fastest.minutes
    );


  if (
    extraMinutes === 0
  ) {
    safetyExtra.textContent =
      "Same estimated travel time as fastest route";
  } else {
    safetyExtra.textContent =
      `${extraMinutes} min slower than fastest`;
  }


  /*
   * --------------------------------
   * ALTERNATIVE ROUTE MESSAGE
   * --------------------------------
   */

  if (
    alternativesAvailable
  ) {
    altNote.hidden = false;

    altNote.textContent =
      "SafeRoute compared multiple real road routes using historical collision exposure.";
  } else {
    altNote.hidden = false;

    altNote.textContent =
      "Only one alternative road route was available for this trip.";
  }


  /*
   * --------------------------------
   * COLLISION COMPARISON
   * --------------------------------
   */

  avoidedList.innerHTML = "";


  const fastestCrashes =
    fastest.crashCount;

  const safetyCrashes =
    safety.crashCount;


  const riskItem =
    document.createElement(
      "li"
    );


  if (
    fastestCrashes != null &&
    safetyCrashes != null
  ) {

    const difference =
      fastestCrashes -
      safetyCrashes;


    const percent =
      fastestCrashes > 0
        ? Math.round(
            (
              difference /
              fastestCrashes
            ) *
              100
          )
        : 0;


    if (
      difference > 0
    ) {

      riskItem.innerHTML = `
        <strong>
          Fastest route:
          ${fastestCrashes.toLocaleString()}
          historical collisions
        </strong>

        <span>
          Safety route:
          ${safetyCrashes.toLocaleString()}
          historical collisions
        </span>

        <span>
          The Safety route has
          ${difference.toLocaleString()}
          fewer historical collisions near
          the route — about ${percent}% lower
          historical collision exposure.
        </span>

        <span>
          Historical collision exposure comes
          from the City of Los Angeles public
          collision dataset. This does not
          guarantee that a route is currently safer.
        </span>
      `;

    } else if (
      difference < 0
    ) {

      riskItem.innerHTML = `
        <strong>
          Fastest route:
          ${fastestCrashes.toLocaleString()}
          historical collisions
        </strong>

        <span>
          Safety route:
          ${safetyCrashes.toLocaleString()}
          historical collisions
        </span>

        <span>
          The selected Safety route has
          ${Math.abs(difference).toLocaleString()}
          more historical collisions near
          the route.
        </span>

        <span>
          Historical collision exposure comes
          from the City of Los Angeles public
          collision dataset.
        </span>
      `;

    } else {

      riskItem.innerHTML = `
        <strong>
          Fastest route:
          ${fastestCrashes.toLocaleString()}
          historical collisions
        </strong>

        <span>
          Safety route:
          ${safetyCrashes.toLocaleString()}
          historical collisions
        </span>

        <span>
          Both routes have the same historical
          collision exposure.
        </span>

        <span>
          Historical collision exposure comes
          from the City of Los Angeles public
          collision dataset.
        </span>
      `;
    }

  } else {

    riskItem.innerHTML = `
      <strong>
        Historical crash data unavailable
      </strong>

      <span>
        The road routes are real, but historical
        collision data could not be loaded
        for this request.
      </span>
    `;
  }


  avoidedList.appendChild(
    riskItem
  );


  /*
   * --------------------------------
   * WHY DID THE ROUTE CHANGE?
   * --------------------------------
   */

  if (
    fastestCrashes != null &&
    safetyCrashes != null
  ) {

    const difference =
      fastestCrashes -
      safetyCrashes;


    if (
      difference > 0
    ) {

      explanation.textContent =
        `SafeRoute selected a different road path because it found lower historical collision exposure. The fastest route has ${fastestCrashes.toLocaleString()} historical collisions near the route, while the safety route has ${safetyCrashes.toLocaleString()}.`;

    } else {

      explanation.textContent =
        "SafeRoute compared the available routes using historical collision exposure. In this case, the safety route did not have lower historical collision exposure than the fastest route.";
    }

  } else {

    explanation.textContent =
      "SafeRoute compares available road routes using historical collision exposure from public data.";
  }


  /*
   * --------------------------------
   * SHOW SELECTED ROUTE
   * --------------------------------
   */

  showRoute(
    result
  );
}