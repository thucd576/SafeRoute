let map;
let routeLayer;
let fastestLayer;
let markersLayer;

export function initMap(
  mapElement
) {
  map = L.map(mapElement).setView(
    [34.0522, -118.2437],
    11
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution:
        "&copy; OpenStreetMap contributors",
    }
  ).addTo(map);

  markersLayer =
    L.layerGroup().addTo(map);
}

export function showRoute(
  result
) {
  if (!map) {
    return;
  }

  if (!result) {
    return;
  }

  const route =
    result.selected;

  const fastest =
    result.fastest;

  const from =
    result.from;

  const to =
    result.to;

  if (!route || !route.geometry) {
    console.error(
      "SafeRoute: selected route is missing geometry.",
      result
    );

    return;
  }

  if (routeLayer) {
    routeLayer.remove();
  }

  if (fastestLayer) {
    fastestLayer.remove();
  }

  markersLayer.clearLayers();

  /*
   * OSRM returns coordinates as:
   * [longitude, latitude]
   *
   * Leaflet expects:
   * [latitude, longitude]
   */

  const selectedCoordinates =
    route.geometry.coordinates.map(
      ([lon, lat]) => [lat, lon]
    );

  /*
   * Draw the selected route.
   */

  routeLayer =
    L.polyline(
      selectedCoordinates,
      {
        weight: 6,
        opacity: 0.9,
      }
    ).addTo(map);

  /*
   * Draw the fastest route as a
   * secondary dashed line if it is
   * different from the selected route.
   */

  if (
    fastest &&
    fastest.geometry &&
    fastest.geometry !==
      route.geometry
  ) {
    const fastestCoordinates =
      fastest.geometry.coordinates.map(
        ([lon, lat]) => [lat, lon]
      );

    fastestLayer =
      L.polyline(
        fastestCoordinates,
        {
          weight: 4,
          opacity: 0.55,
          dashArray: "8 8",
        }
      ).addTo(map);
  }

  /*
   * Start marker.
   */

  if (from) {
    L.marker([
      from.lat,
      from.lon,
    ])
      .bindPopup(
        `<strong>Start</strong><br>${from.label}`
      )
      .addTo(markersLayer);
  }

  /*
   * Destination marker.
   */

  if (to) {
    L.marker([
      to.lat,
      to.lon,
    ])
      .bindPopup(
        `<strong>Destination</strong><br>${to.label}`
      )
      .addTo(markersLayer);
  }

  /*
   * Zoom the map to the selected route.
   */

  map.fitBounds(
    routeLayer.getBounds(),
    {
      padding: [30, 30],
    }
  );
}