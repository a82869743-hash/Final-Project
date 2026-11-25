"use client";

import { TileLayer } from "react-leaflet";
import { getLayer } from "@/lib/mapTiles";

/** Key-free basemap + optional labels overlay (see lib/mapTiles.ts). */
export default function BaseTiles({ layerId = "streets" }: { layerId?: string }) {
  const layer = getLayer(layerId);
  return (
    <>
      <TileLayer key={layer.id} url={layer.url} attribution={layer.attribution}
        maxZoom={layer.maxZoom} subdomains={layer.subdomains ?? "abc"} />
      {layer.overlay && (
        <TileLayer key={`${layer.id}-labels`} url={layer.overlay.url} attribution={layer.overlay.attribution}
          maxZoom={layer.maxZoom} />
      )}
    </>
  );
}
