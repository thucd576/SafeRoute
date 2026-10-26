import { getCrashPointsForRoute } from "./crash-data.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const geocodeCache = new Map();

// How many distinct alternatives we try to find.
const TARGET_ALTERNATIVES = 2;

// Detour points sit to the left (+) or right (-) of the straight line
// between start and destination, as a fraction of the trip's length.
const DETOUR_OFFSETS = [0.25, -0.25, 0.45, -0.45];

// A generated detour is only kept if it stays reasonably close to the
// fastest route's travel time.
const MAX_EXTRA_RATIO = 1.6;      // at most 60% longer than fastest...
const MAX_EXTRA_MINUTES = 25;     // ...and at most 25 extra minutes.

// The public OSRM server asks for no more than about 1 request per second.
const OSRM_DELAY_MS = 1000;

export async function findRoutes({ start, destination, preference = "fastest" }) {
  const from = await geocode(start);
  await wait(1100);
  const to = await geocode(destination);

  // 1. Ask OSRM for the normal route plus any built-in alternatives.
  const directRoutes = await requestOsrmRoutes([from, to], { alternatives: true });

  const candidates = directRoutes
    .map((route, index) => summarizeRoute(route, index, "OSRM"))
    .sort((a, b) => a.seconds - b.seconds);

  if (!candidates.length) {
    throw new Error("No usable driving route was returned. Check the addresses and try again.");
  }

  const fastest = candidates[0];
  fastest.id = "fastest";

  // 2. Keep built-in alternatives that follow a genuinely different path.
  const distinctRoutes = [];

  for (const candidate of candidates.slice(1)) {
    addIfDistinct(candidate, fastest, distinctRoutes);
  }

  // 3. OSRM often returns only one route for short city trips. If so, build
  //    extra options by routing through detour points beside the direct path.
  let generatedCount = 0;

  if (distinctRoutes.length < TARGET_ALTERNATIVES) {
    const detourPoints = makeDetourPoints(from, to);

    for (const via of detourPoints) {
      if (distinctRoutes.length >= TARGET_ALTERNATIVES) break;

      await wait(OSRM_DELAY_MS);

      try {
        const [route] = await requestOsrmRoutes([from, via, to], { alternatives: false });
        if (!route) continue;

        const candidate = summarizeRoute(route, distinctRoutes.length + 1, "OSRM detour");

        if (!isReasonableDetour(candidate, fastest)) continue;

        if (addIfDistinct(candidate, fastest, distinctRoutes)) {
          generatedCount++;
        }
      } catch (error) {
        console.warn("SafeRoute: a detour route request failed:", error);
      }
    }
  }

  distinctRoutes
    .sort((a, b) => a.seconds - b.seconds)
    .forEach((route, index) => {
      route.id = `alternative-${index + 1}`;
    });

  const allRoutes = [fastest, ...distinctRoutes];

  // 4. Approximate historical collision exposure for each route.
  for (const route of allRoutes) {
    try {
      const crashes = await getCrashPointsForRoute(route.geometry);
      route.crashCount = Array.isArray(crashes) ? crashes.length : null;
      route.crashRisk =
        route.crashCount == null || route.miles <= 0
          ? null
          : route.crashCount / route.miles;
    } catch (error) {
      console.warn("SafeRoute: collision data unavailable for a route:", error);
      route.crashCount = null;
      route.crashRisk = null;
    }
  }

  const alternatives = allRoutes.slice(1);

  // 5. Safety: lowest collisions per mile among routes that have data.
  const safetyCandidates = alternatives.filter(route => route.crashRisk != null);

  const safety =
    fastest.crashRisk == null || !safetyCandidates.length
      ? fastest
      : lowestRisk([fastest, ...safetyCandidates]);

  // 6. Balanced: lowest collisions per mile among routes that add 10 minutes or less.
  const balancedCandidates = alternatives.filter(
    route => route.crashRisk != null && route.minutes - fastest.minutes <= 10
  );

  const balanced =
    balancedCandidates.length && fastest.crashRisk != null
      ? lowestRisk([fastest, ...balancedCandidates])
      : fastest;

  const selected =
    preference === "safety"
      ? safety
      : preference === "balanced"
        ? balanced
        : fastest;

  return {
    query: { start, destination, preference },
    from,
    to,
    routes: allRoutes,
    alternativesAvailable: alternatives.length > 0,
    alternativeCount: alternatives.length,
    generatedAlternativeCount: generatedCount,
    fastest: withDelta(fastest, fastest),
    balanced: withDelta(balanced, fastest),
    safety: withDelta(safety, fastest),
    selected: withDelta(selected, fastest)
  };
}

// ---------- Routing helpers ----------

async function requestOsrmRoutes(points, { alternatives }) {
  const path = points.map(point => `${point.lon},${point.lat}`).join(";");
  const url =
    `${OSRM_URL}/${path}` +
    `?overview=full&geometries=geojson&steps=false&alternatives=${alternatives ? 3 : "false"}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Routing service failed (${response.status}). Please try again.`);
  }

  const data = await response.json();

  if (data.code !== "Ok" || !Array.isArray(data.routes)) {
    throw new Error("No driving route was returned. Check the addresses and try again.");
  }

  return data.routes.filter(route => route.geometry?.coordinates?.length > 1);
}

// Points to the left and right of the midpoint of the straight line
// between start and destination.
function makeDetourPoints(from, to) {
  const midLat = (from.lat + to.lat) / 2;
  const midLon = (from.lon + to.lon) / 2;
  const metersPerDegLat = 110540;
  const metersPerDegLon = 111320 * Math.cos(midLat * Math.PI / 180);

  // Direction of travel in metres.
  const dx = (to.lon - from.lon) * metersPerDegLon;
  const dy = (to.lat - from.lat) * metersPerDegLat;
  const length = Math.hypot(dx, dy);

  if (length < 300) return [];

  // Unit vector perpendicular to the direction of travel.
  const px = -dy / length;
  const py = dx / length;

  return DETOUR_OFFSETS.map(fraction => {
    const sign = Math.sign(fraction);
    const offset = sign * Math.min(10000, Math.max(1000, Math.abs(fraction) * length));

    return {
      lat: midLat + (py * offset) / metersPerDegLat,
      lon: midLon + (px * offset) / metersPerDegLon
    };
  });
}

function isReasonableDetour(candidate, fastest) {
  const extraSeconds = candidate.seconds - fastest.seconds;

  return (
    candidate.seconds <= fastest.seconds * MAX_EXTRA_RATIO &&
    extraSeconds <= MAX_EXTRA_MINUTES * 60
  );
}

function addIfDistinct(candidate, fastest, distinctRoutes) {
  const kept = [fastest, ...distinctRoutes];

  if (kept.every(existing => areDistinct(candidate.geometry, existing.geometry))) {
    distinctRoutes.push(candidate);
    return true;
  }

  return false;
}

function lowestRisk(routes) {
  return routes.reduce((best, route) =>
    route.crashRisk < best.crashRisk ? route : best
  );
}

// ---------- Geocoding ----------

async function geocode(query) {
  const key = query.trim().toLowerCase();

  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Address lookup failed (${response.status}).`);
  }

  const results = await response.json();

  if (!results.length) {
    throw new Error(`No location found for "${query}". Try a more specific address.`);
  }

  const place = {
    query,
    label: results[0].display_name,
    lat: Number(results[0].lat),
    lon: Number(results[0].lon)
  };

  geocodeCache.set(key, place);
  return place;
}

// ---------- Route summaries and comparison ----------

function summarizeRoute(route, index, source) {
  const seconds = Number(route.duration);
  const meters = Number(route.distance);

  return {
    id: `route-${index}`,
    source,
    seconds,
    meters,
    minutes: Math.round(seconds / 60),
    miles: Number((meters / 1609.344).toFixed(1)),
    geometry: route.geometry,
    crashCount: null,
    crashRisk: null
  };
}

// A candidate counts as a different route when at least 25% of its sample
// points are more than 250 metres from every point on the other route.
// (This compares against the whole other route, so routes of different
// lengths that share the same roads are correctly treated as the same.)
function areDistinct(candidateGeometry, existingGeometry) {
  const samples = sampleGeometry(candidateGeometry, 40);
  const other = sampleGeometry(existingGeometry, 300);

  if (samples.length < 2 || other.length < 2) return false;

  let offRoute = 0;

  for (const point of samples) {
    const nearest = Math.min(...other.map(otherPoint => distanceMeters(point, otherPoint)));
    if (nearest > 250) offRoute++;
  }

  return offRoute / samples.length >= 0.25;
}

function sampleGeometry(geometry, count) {
  const coordinates = geometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
  if (coordinates.length <= count) return coordinates;

  return Array.from({ length: count }, (_, i) => {
    const index = Math.round(i * (coordinates.length - 1) / (count - 1));
    return coordinates[index];
  });
}

function distanceMeters(a, b) {
  const toRadians = value => value * Math.PI / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function withDelta(route, fastest) {
  return {
    ...route,
    extraMinutes: Math.max(0, route.minutes - fastest.minutes),
    sameAsFastest: route.id === fastest.id
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
