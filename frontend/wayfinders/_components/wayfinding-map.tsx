"use client";

import { useState, useEffect } from "react";
import {
    Map,
    MapMarker,
    MapSearchControl,
    MapLayers,
    MapLayersControl,
    MapTileLayer,
    MapZoomControl,
    MapLocateControl,
    MapPolyline,
    MapTooltip,
} from "@/components/ui/map";
import { Button } from "@/components/ui/button";
import { Navigation, MapPin } from "lucide-react";
import { useTheme } from "next-themes";
import type { LatLngExpression } from "leaflet";
import type { PlaceFeature } from "@/components/ui/place-autocomplete";
import { useMap } from "react-leaflet";

interface WayfindingMapProps {
    center?: [number, number];
    zoom?: number;
}

interface Location {
    name: string;
    address?: string;
    coordinates: [number, number];
}

interface RouteData {
    route: any;
    nearby_venues: any[];
    penalty_score: number;
}

// Singapore bounding box: [minLon, minLat, maxLon, maxLat]
const SINGAPORE_BBOX: [number, number, number, number] = [
    103.6, 1.15, 104.1, 1.47,
];

function MapContent() {
    const map = useMap();
    const [startLocation, setStartLocation] = useState<Location | null>(null);
    const [endLocation, setEndLocation] = useState<Location | null>(null);
    const [routes, setRoutes] = useState<RouteData[]>([]);
    const [loading, setLoading] = useState(false);

    const handleStartSelect = (feature: PlaceFeature) => {
        console.log("Start selected - full feature:", feature);

        const location: Location = {
            name: feature.properties.name || "Start Location",
            address: feature.properties.name || "",
            coordinates: feature.geometry.coordinates.toReversed() as [
                number,
                number,
            ],
        };

        console.log("Start location created:", location);
        setStartLocation(location);
        map.panTo(location.coordinates);
    };

    const handleEndSelect = (feature: PlaceFeature) => {
        console.log("End selected - full feature:", feature);

        const location: Location = {
            name: feature.properties.name || "End Location",
            address: feature.properties.name || "",
            coordinates: feature.geometry.coordinates.toReversed() as [
                number,
                number,
            ],
        };

        console.log("End location created:", location);
        setEndLocation(location);
        map.panTo(location.coordinates);
    };

    const handleCalculateRoute = async () => {
        if (!startLocation || !endLocation) return;

        setLoading(true);
        try {
            const response = await fetch("http://127.0.0.1:8000/routes/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    start: {
                        longitude: startLocation.coordinates[1],
                        latitude: startLocation.coordinates[0],
                    },
                    end: {
                        longitude: endLocation.coordinates[1],
                        latitude: endLocation.coordinates[0],
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Routes received:", data);
            setRoutes(data.routes || []);
        } catch (error) {
            console.error("Error calculating route:", error);
            alert("Failed to calculate route. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* First Search Control - START */}
            <MapSearchControl
                className="top-1 left-1 z-9999"
                placeholder="Search start location..."
                onPlaceSelect={handleStartSelect}
                bbox={SINGAPORE_BBOX}
            />

            {/* Second Search Control - END */}
            <MapSearchControl
                className="top-12 left-1"
                placeholder="Search destination..."
                onPlaceSelect={handleEndSelect}
                bbox={SINGAPORE_BBOX}
            />

            <MapLocateControl className="top-auto right-1 bottom-20 left-auto" />
            <MapZoomControl className="top-auto right-1 bottom-1 left-auto" />

            {/* Start Location Marker - GREEN */}
            {startLocation && (
                <MapMarker
                    key={`start-${startLocation.coordinates[0]}-${startLocation.coordinates[1]}`}
                    position={startLocation.coordinates as LatLngExpression}
                    icon={<MapPin className="size-8 text-green-500" />}
                >
                    <MapTooltip side="top">Start</MapTooltip>
                </MapMarker>
            )}

            {/* End Location Marker - RED */}
            {endLocation && (
                <MapMarker
                    key={`end-${endLocation.coordinates[0]}-${endLocation.coordinates[1]}`}
                    position={endLocation.coordinates as LatLngExpression}
                    icon={<MapPin className="size-8 text-red-500" />}
                >
                    <MapTooltip side="top">End</MapTooltip>
                </MapMarker>
            )}

            {/* Route Lines from API */}
            {routes.length > 0 &&
                routes.map((routeData, index) => {
                    const coordinates =
                        routeData.route?.geometry?.coordinates || [];
                    if (coordinates.length === 0) return null;

                    const positions: LatLngExpression[] = coordinates.map(
                        (coord: [number, number]) => [
                            coord[1], // latitude
                            coord[0], // longitude
                        ],
                    );

                    const colors = ["#22c55e", "#3b82f6", "#f59e0b"];
                    const color = colors[index] || "#6b7280";

                    return (
                        <MapPolyline
                            key={`route-${index}`}
                            positions={positions}
                            pathOptions={{
                                color,
                                weight: 5,
                                opacity: 0.8,
                                fillColor: color,
                                fillOpacity: 0,
                            }}
                            className=""
                        />
                    );
                })}

            {/* Calculate Route Button */}
            {startLocation && endLocation && (
                <div className="leaflet-control absolute top-24 left-1 z-1000 pointer-events-auto">
                    <Button
                        className="shadow-2xl"
                        size="lg"
                        onClick={handleCalculateRoute}
                        disabled={loading}
                    >
                        <Navigation className="mr-2 h-5 w-5" />
                        {loading ? "Calculating..." : "Calculate Route"}
                    </Button>
                </div>
            )}
        </>
    );
}

export function WayfindingMap({
    center = [1.2959854, 103.7766606],
    zoom = 16,
}: WayfindingMapProps) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return null;
    }

    return (
        <div className="relative w-full h-screen">
            <Map center={center} zoom={zoom} className="w-full h-full">
                <MapLayers defaultTileLayer="Light">
                    <MapLayersControl className="top-1 right-1 left-auto bottom-auto" />

                    <MapTileLayer
                        name="Streets"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />

                    <MapTileLayer
                        name="Hybrid"
                        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                        attribution="Map data &copy; Google"
                    />

                    <MapTileLayer
                        name="Satellite"
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution="Tiles &copy; Esri"
                    />

                    <MapTileLayer
                        name="Dark"
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution="&copy; CARTO"
                    />

                    <MapTileLayer
                        name="Light"
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                        attribution="&copy; CARTO"
                    />
                </MapLayers>

                <MapContent />
            </Map>
        </div>
    );
}
