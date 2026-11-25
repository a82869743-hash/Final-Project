/**
 * Shared, key-free HD basemaps for every Leaflet map.
 *
 * All providers below are free to use without an API key:
 *  - CARTO Voyager / Dark Matter: OSM-based, served at @2x for retina ("HD")
 *  - Esri World Imagery: high-resolution satellite imagery
 *  - OpenStreetMap standard: reference layer
 */

export interface BaseLayer {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
}

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const BASE_LAYERS: BaseLayer[] = [
  {
    id: "voyager",
    name: "Streets HD",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    maxZoom: 20,
    subdomains: "abcd",
  },
  {
    id: "dark",
    name: "Tactical Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    maxZoom: 20,
    subdomains: "abcd",
  },
  {
    id: "satellite",
    name: "Satellite HD",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTR,
    maxZoom: 19,
  },
];

/** Labels-only overlay to put place names on top of satellite imagery. */
export const LABELS_OVERLAY = {
  url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
  attribution: "&copy; CARTO",
  subdomains: "abcd",
};

export const getLayer = (id: string) => BASE_LAYERS.find((l) => l.id === id) ?? BASE_LAYERS[0];

/** India bounding box (with margin) so users cannot pan off to the Atlantic. */
export const INDIA_BOUNDS: [[number, number], [number, number]] = [[4.5, 64.0], [38.5, 99.5]];
export const INDIA_CENTER: [number, number] = [22.5, 79.0];
