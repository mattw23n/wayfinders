'use client';

import {
  Map,
  MapMarker,
  MapPopup,
  MapTileLayer,
  MapZoomControl,
} from "@/components/ui/map";

interface WayfindingMapProps {
  center?: [number, number];
  zoom?: number;
}

export function WayfindingMap({ 
  center = [1.290665504, 103.772663576],
  zoom = 16 
}: WayfindingMapProps) {
  return (
    <Map center={center} zoom={zoom} className="w-full h-screen">
      <MapTileLayer />
      <MapZoomControl />
      <MapMarker position={center}>
        <MapPopup>A map component for shadcn/ui.</MapPopup>
      </MapMarker>
    </Map>
  );
}