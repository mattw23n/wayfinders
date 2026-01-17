'use client';

import {
  Map,
  MapMarker,
  MapPopup,
  MapSearchControl,
  MapTileLayer,
  MapZoomControl,
  MapLocateControl,
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
      
      {/* First Search Control - Top Left */}
      <MapSearchControl className="top-1 left-1" />
      
      {/* Second Search Control - Top Left, closer spacing */}
      <MapSearchControl className="top-12 left-1" />
      
      {/* Locate Control - Bottom Right, above Zoom */}
      <MapLocateControl className="top-auto right-1 bottom-20 left-auto" />
      
      {/* Zoom Control - Bottom Right */}
      <MapZoomControl className="top-auto right-1 bottom-1 left-auto" />
      
      <MapMarker position={center}>
        <MapPopup>A map component for shadcn/ui.</MapPopup>
      </MapMarker>
    </Map>
  );
}