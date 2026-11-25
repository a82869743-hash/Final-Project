/**
 * Shared basemaps for every Leaflet map: all usable WITHOUT an API key.
 *
 * Checked Nov 2026:
 *  - CARTO basemaps now return an "API KEY REQUIRED" watermark tile → not used
 *  - tile.openstreetmap.org blocks apps outside its tile usage policy (HTTP 418) → not used
 *  - Esri ArcGIS Online basemaps (street, dark canvas, imagery) work without a key
 *  - OpenTopoMap works without a key
 */

export interface BaseLayer {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
  /** Optional transparent labels layer drawn on top */
  overlay?: { url: string; attribution: string };
}

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

export const BASE_LAYERS: BaseLayer[] = [
  {
    id: "streets",
    name: "Streets HD",
    url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri &mdash; HERE, Garmin, OpenStreetMap contributors",
    maxZoom: 19,
  },
  {
    id: "dark",
    name: "Tactical Dark",
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri &mdash; HERE, Garmin, OpenStreetMap contributors",
    maxZoom: 16,
    overlay: { url: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, attribution: "&copy; Esri" },
  },
  {
    id: "satellite",
    name: "Satellite HD",
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri &mdash; Maxar, Earthstar Geographics",
    maxZoom: 19,
    overlay: { url: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, attribution: "&copy; Esri" },
  },
  {
    id: "topo",
    name: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: 'Map data &copy; OpenStreetMap contributors, SRTM &mdash; &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
    subdomains: "abc",
  },
];

/** Legacy ids from earlier versions map onto the new layers */
const ALIASES: Record<string, string> = { voyager: "streets", osm: "streets" };

export const getLayer = (id: string) =>
  BASE_LAYERS.find((l) => l.id === (ALIASES[id] ?? id)) ?? BASE_LAYERS[0];

/** India bounding box (with margin) so users cannot pan off to the Atlantic. */
export const INDIA_BOUNDS: [[number, number], [number, number]] = [[4.5, 64.0], [38.5, 99.5]];
export const INDIA_CENTER: [number, number] = [22.5, 79.0];
