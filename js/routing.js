/**
 * SafeRoute routing:
 *
 * OSRM = Fastest route
 * Valhalla = Alternative routes
 *
 * Historical collision data from the City of Los Angeles
 * is used to select the safest available route.
 */

import { getCrashPointsForRoute } from "./crash-data.js";

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const OSRM_URL =
  "https://router.project-osrm.org/route/v1/driving";

const VALHALLA_URL =
  "https://valhalla1.openstreetmap.de/route";

const geocodeCache = new Map();


export async function findRoutes({
  start,
  destination,
  preference,
}) {
  /*
   * -----------------------------
   * 1. Geocode locations
   * -----------------------------
   */

  const from =
    await geocode(start);

  await wait(1100);

  const to =
    await geocode(destination);


  /*
   * -----------------------------
   * 2. Get OSRM fastest route
   * -----------------------------
   */

  const osrm =
    await requestOsrmRoute(
      from,
      to
    );

  const fastest =
    summarizeOsrmRoute(
      osrm.routes[0]
    );


  /*
   * -----------------------------
   * 3. Get Valhalla alternatives
   * -----------------------------
   */

  const valhalla =
    await requestValhallaRoutes(
      from,
      to
    );


  /*
   * Convert Valhalla routes.
   */

  const alternatives =
    valhalla.routes
      .map(
        (route, index) =>
          summarizeValhallaRoute(
            route,
            index
          )
      )
      .filter(
        (route) =>
          route.geometry.coordinates
            .length > 0
      );


  /*
   * Put the OSRM fastest route
   * first for comparison.
   */

  const allRoutes = [
    fastest,
    ...alternatives,
  ];


  /*
   * -----------------------------
   * 4. Calculate crash exposure
   * -----------------------------
   */

  for (
    const route of allRoutes
  ) {
    try {
      const crashes =
        await getCrashPointsForRoute(
          route.geometry
        );

      route.crashCount =
        crashes.length;

      route.crashRisk =
        calculateRiskScore(
          crashes.length,
          route.miles
        );
    } catch (error) {
      console.error(
        "Crash data unavailable:",
        error
      );

      route.crashCount = null;
      route.crashRisk = null;
    }
  }


  /*
   * -----------------------------
   * 5. Choose safest route
   * -----------------------------
   *
   * The safest route is whichever
   * available route has the lowest
   * historical collision exposure.
   */

  const safety =
    [...allRoutes].sort(
      (a, b) => {
        if (
          a.crashRisk == null &&
          b.crashRisk == null
        ) {
          return (
            a.seconds -
            b.seconds
          );
        }

        if (
          a.crashRisk == null
        ) {
          return 1;
        }

        if (
          b.crashRisk == null
        ) {
          return -1;
        }

        return (
          a.crashRisk -
          b.crashRisk
        );
      }
    )[0];


  /*
   * -----------------------------
   * 6. Balanced route
   * -----------------------------
   */

  const balanced =
    pickBalanced(
      allRoutes,
      fastest
    );


  /*
   * -----------------------------
   * 7. Determine selected route
   * -----------------------------
   */

  const selected =
    preference === "safety"
      ? safety
      : preference === "balanced"
        ? balanced
        : fastest;


  /*
   * -----------------------------
   * 8. Return results
   * -----------------------------
   */

  return {
    query: {
      start,
      destination,
      preference,
    },

    from,
    to,

    alternativesAvailable:
      alternatives.length > 0,

    alternativeCount:
      alternatives.length,

    fastest:
      withDelta(
        fastest,
        fastest
      ),

    balanced:
      withDelta(
        balanced,
        fastest
      ),

    safety:
      withDelta(
        safety,
        fastest
      ),

    selected:
      withDelta(
        selected,
        fastest
      ),
  };
}


/* =================================
   GEOCODING
================================= */

async function geocode(
  query
) {
  const key =
    query
      .trim()
      .toLowerCase();

  if (
    geocodeCache.has(key)
  ) {
    return geocodeCache.get(
      key
    );
  }

  const url =
    new URL(
      NOMINATIM_URL
    );

  url.searchParams.set(
    "q",
    query
  );

  url.searchParams.set(
    "format",
    "json"
  );

  url.searchParams.set(
    "limit",
    "1"
  );

  const response =
    await fetch(url, {
      headers: {
        Accept:
          "application/json",
      },
    });

  if (!response.ok) {
    throw new Error(
      `Geocoding failed (${response.status}).`
    );
  }

  const results =
    await response.json();

  if (!results.length) {
    throw new Error(
      `No location found for “${query}”.`
    );
  }

  const place = {
    query,

    label:
      results[0]
        .display_name,

    lat:
      Number(
        results[0].lat
      ),

    lon:
      Number(
        results[0].lon
      ),
  };

  geocodeCache.set(
    key,
    place
  );

  return place;
}


/* =================================
   OSRM — FASTEST ROUTE
================================= */

async function requestOsrmRoute(
  from,
  to
) {
  const path =
    `${from.lon},${from.lat};` +
    `${to.lon},${to.lat}`;

  const url =
    `${OSRM_URL}/${path}` +
    `?overview=full` +
    `&geometries=geojson`;


  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `OSRM routing failed (${response.status}).`
    );
  }

  const data =
    await response.json();

  if (
    data.code !== "Ok" ||
    !data.routes?.length
  ) {
    throw new Error(
      "OSRM did not return a driving route."
    );
  }

  return data;
}


function summarizeOsrmRoute(
  route
) {
  const seconds =
    Number(
      route.duration
    );

  const meters =
    Number(
      route.distance
    );

  return {
    id:
      "osrm-fastest",

    source:
      "OSRM",

    seconds,

    meters,

    minutes:
      Math.round(
        seconds / 60
      ),

    miles: Number(
      (
        meters /
        1609.344
      ).toFixed(1)
    ),

    geometry:
      route.geometry,
  };
}


/* =================================
   VALHALLA — ALTERNATIVES
================================= */

async function requestValhallaRoutes(
  from,
  to
) {
  const request = {
    locations: [
      {
        lat: from.lat,
        lon: from.lon,
        type: "break",
      },

      {
        lat: to.lat,
        lon: to.lon,
        type: "break",
      },
    ],

    costing: "auto",

    units: "miles",

    alternates: 2,

    directions_options: {
      units: "miles",
      format: "json",
    },
  };


  const response =
    await fetch(
      VALHALLA_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-Client-Id":
            "saferoute-mgmt275",
        },

        body:
          JSON.stringify(
            request
          ),
      }
    );


  if (!response.ok) {
    throw new Error(
      `Valhalla routing failed (${response.status}).`
    );
  }


  const data =
    await response.json();


  if (
    !data.trip ||
    !data.trip.legs?.length
  ) {
    throw new Error(
      "Valhalla did not return an alternative route."
    );
  }


  /*
   * Primary Valhalla route plus
   * any alternate routes.
   */

  const routes = [
    data.trip,
    ...(data.trip.alternates || []),
  ];


  return {
    routes,
  };
}


/* =================================
   VALHALLA ROUTE SUMMARY
================================= */

function summarizeValhallaRoute(
  route,
  index
) {
  const summary =
    route.summary ||
    route.trip?.summary;


  const seconds =
    Number(
      summary?.time || 0
    );


  const miles =
    Number(
      summary?.length || 0
    );


  const coordinates =
    decodeValhallaShape(
      route
    );


  return {
    id:
      `valhalla-${index}`,

    source:
      "Valhalla",

    seconds,

    meters:
      miles *
      1609.344,

    miles: Number(
      miles.toFixed(1)
    ),

    minutes:
      Math.round(
        seconds / 60
      ),

    geometry: {
      type:
        "LineString",

      coordinates,
    },
  };
}


/* =================================
   VALHALLA POLYLINE DECODER
================================= */

function decodeValhallaShape(
  route
) {
  const shapes =
    route.legs
      ?.map(
        (leg) =>
          leg.shape
      )
      .filter(Boolean);


  if (
    !shapes?.length
  ) {
    return [];
  }


  const coordinates = [];


  for (
    const shape of shapes
  ) {
    const decoded =
      decodePolyline6(
        shape
      );


    if (
      coordinates.length &&
      decoded.length
    ) {
      decoded.shift();
    }


    coordinates.push(
      ...decoded
    );
  }


  return coordinates;
}


function decodePolyline6(
  encoded
) {
  const coordinates = [];

  let index = 0;

  let lat = 0;

  let lon = 0;


  while (
    index <
    encoded.length
  ) {
    let result = 0;

    let shift = 0;

    let byte;


    do {
      byte =
        encoded.charCodeAt(
          index++
        ) - 63;

      result |=
        (byte & 0x1f) <<
        shift;

      shift += 5;
    } while (
      byte >= 0x20
    );


    const deltaLat =
      result & 1
        ? ~(result >> 1)
        : result >> 1;


    lat += deltaLat;


    result = 0;

    shift = 0;


    do {
      byte =
        encoded.charCodeAt(
          index++
        ) - 63;

      result |=
        (byte & 0x1f) <<
        shift;

      shift += 5;
    } while (
      byte >= 0x20
    );


    const deltaLon =
      result & 1
        ? ~(result >> 1)
        : result >> 1;


    lon += deltaLon;


    coordinates.push([
      lon / 1e6,
      lat / 1e6,
    ]);
  }


  return coordinates;
}


/* =================================
   BALANCED ROUTE
================================= */

function pickBalanced(
  routes,
  fastest
) {
  if (
    routes.length === 1
  ) {
    return fastest;
  }


  /*
   * Prefer the route that is
   * reasonably close to fastest
   * while still being an alternative.
   */

  const sorted =
    [...routes].sort(
      (a, b) =>
        a.seconds -
        b.seconds
    );


  return (
    sorted[1] ||
    fastest
  );
}


/* =================================
   ROUTE DIFFERENCE
================================= */

function withDelta(
  route,
  fastest
) {
  const extraMinutes =
    Math.max(
      0,
      route.minutes -
        fastest.minutes
    );


  const sameAsFastest =
    route.id ===
    fastest.id;


  return {
    ...route,

    extraMinutes,

    sameAsFastest,
  };
}


/* =================================
   COLLISION RISK
================================= */

function calculateRiskScore(
  crashCount,
  miles
) {
  const safeMiles =
    Math.max(
      miles,
      0.1
    );


  return (
    crashCount /
    safeMiles
  );
}


/* =================================
   DELAY
================================= */

function wait(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}