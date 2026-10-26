const CRASH_API =
  "https://data.lacity.org/resource/d5tf-ez2w.json";

/*
 * Get historical LA traffic collisions near a route.
 *
 * This uses the City of Los Angeles public
 * Traffic Collision Data from 2010 to Present dataset.
 *
 * We create one geographic bounding box around
 * the entire route, retrieve collisions inside it,
 * then count the collisions that are reasonably
 * close to the route.
 */

export async function getCrashPointsForRoute(
  geometry
) {
  const coordinates =
    geometry?.coordinates || [];

  if (!coordinates.length) {
    return [];
  }

  const bounds =
    getRouteBounds(coordinates);

  const crashes =
    await fetchCrashesInBox(bounds);

  return crashes.filter(
    (crash) =>
      isNearRoute(
        crash,
        coordinates
      )
  );
}

async function fetchCrashesInBox(
  bounds
) {
  const url =
    new URL(CRASH_API);

  url.searchParams.set(
    "$where",
    `within_box(location_1, ${bounds.maxLat}, ${bounds.minLon}, ${bounds.minLat}, ${bounds.maxLon})`
  );

  url.searchParams.set(
    "$limit",
    "5000"
  );

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Crash data request failed (${response.status}).`
    );
  }

  const data =
    await response.json();

  return data
    .map((row) => {
      const location =
        row.location_1;

      let lat = Number(row.lat);
      let lon = Number(row.lon);

      /*
       * Some versions of the LA dataset expose
       * coordinates through location_1 instead
       * of separate lat/lon fields.
       */
      if (
        (!Number.isFinite(lat) ||
          !Number.isFinite(lon)) &&
        location
      ) {
        if (
          typeof location === "object" &&
          location.latitude != null &&
          location.longitude != null
        ) {
          lat =
            Number(location.latitude);

          lon =
            Number(location.longitude);
        }
      }

      return {
        id: row.dr_no,

        lat,

        lon,

        date: row.date_occ,

        area: row.area_name,
      };
    })
    .filter(
      (crash) =>
        Number.isFinite(
          crash.lat
        ) &&
        Number.isFinite(
          crash.lon
        )
    );
}

function getRouteBounds(
  coordinates
) {
  const lats =
    coordinates.map(
      ([lon, lat]) => lat
    );

  const lons =
    coordinates.map(
      ([lon, lat]) => lon
    );

  const padding = 0.004;

  return {
    minLat:
      Math.min(...lats) -
      padding,

    maxLat:
      Math.max(...lats) +
      padding,

    minLon:
      Math.min(...lons) -
      padding,

    maxLon:
      Math.max(...lons) +
      padding,
  };
}

function isNearRoute(
  crash,
  coordinates
) {
  /*
   * Rough proximity check.
   *
   * 0.004 degrees is approximately
   * a quarter-mile in Los Angeles.
   */
  const threshold = 0.004;

  return coordinates.some(
    ([routeLon, routeLat]) => {
      const latDifference =
        Math.abs(
          crash.lat -
            routeLat
        );

      const lonDifference =
        Math.abs(
          crash.lon -
            routeLon
        );

      return (
        latDifference <=
          threshold &&
        lonDifference <=
          threshold
      );
    }
  );
}
