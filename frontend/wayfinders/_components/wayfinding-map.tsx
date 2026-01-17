"use client";

import { useState, useEffect, useRef } from "react";
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
import {
    Navigation,
    MapPin,
    ChevronUp,
    ChevronDown,
    Clock,
    Route as RouteIcon,
    AlertTriangle,
    Settings,
    X,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
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
    explanation: string;
}

interface VenueStatus {
    _id: string;
    roomName: string;
    latitude: number;
    longitude: number;
    criticalClasses: Array<{
        class_id: string;
        startTime: string;
        endTime: string;
        size: number;
        name: string;
    }>;
}

// Singapore bounding box: [minLon, minLat, maxLon, maxLat]
const SINGAPORE_BBOX: [number, number, number, number] = [
    103.6, 1.15, 104.1, 1.47,
];

function MapContent() {
    const map = useMap();
    const [simulationTime, setSimulationTime] = useState("2026-01-19T11:50:00");
    const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
    const [tempTime, setTempTime] = useState("");
    const [startLocation, setStartLocation] = useState<Location | null>(null);
    const [endLocation, setEndLocation] = useState<Location | null>(null);
    const [routes, setRoutes] = useState<RouteData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
    const [crowdedVenues, setCrowdedVenues] = useState<VenueStatus[]>([]);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (panelRef.current) {
            L.DomEvent.disableScrollPropagation(panelRef.current);
            L.DomEvent.disableClickPropagation(panelRef.current);
        }
    }, [routes]);

    // Fetch crowded venues on mount
    useEffect(() => {
        const fetchCrowdedVenues = async () => {
            try {
                const response = await fetch(
                    `http://127.0.0.1:8000/venues/status?current_datetime=${encodeURIComponent(simulationTime)}`,
                );
                if (response.ok) {
                    const data = await response.json();
                    console.log(data);
                    setCrowdedVenues(data.venues || []);
                }
            } catch (error) {
                console.error("Error fetching crowded venues:", error);
            }
        };

        fetchCrowdedVenues();
        // Refresh every 5 minutes
        const interval = setInterval(fetchCrowdedVenues, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [simulationTime]);

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

        // Clear existing routes and close panel
        setRoutes([]);
        setIsPanelOpen(false);

        setLoading(true);
        try {
            const response = await fetch(`http://127.0.0.1:8000/routes/?current_datetime=${encodeURIComponent(simulationTime)}`, {
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
                    }
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Routes received:", data);
            setRoutes(data.routes || []);
            setSelectedRouteIndex(0);
            setIsPanelOpen(true);
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

            {/* Time Settings Button */}
            <div className="absolute top-4 right-4 z-2000 pointer-events-auto">
                <Button
                    variant="secondary"
                    size="icon"
                    className="shadow-md"
                    onClick={() => {
                        setTempTime(simulationTime);
                        setIsTimeModalOpen(true);
                    }}
                >
                    <Settings className="h-5 w-5" />
                </Button>
            </div>

            {/* Time Settings Modal */}
            {isTimeModalOpen && (
                <div className="fixed inset-0 z-10000 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div
                        className="bg-background p-6 rounded-lg shadow-xl w-full max-w-md border border-border"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold">
                                Select Time
                            </h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsTimeModalOpen(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex flex-col gap-2">
                                <input
                                    type="datetime-local"
                                    step="1"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={tempTime}
                                    onChange={(e) =>
                                        setTempTime(e.target.value)
                                    }
                                />
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsTimeModalOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => {
                                        setSimulationTime(tempTime);
                                        setIsTimeModalOpen(false);
                                    }}
                                >
                                    Save
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <MapLocateControl className="top-auto right-1 bottom-20 left-auto" />
            <MapZoomControl className="top-auto right-1 bottom-30 left-auto" />

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

            {/* Crowded Venues Heatmap */}
            {crowdedVenues.map((venue) => {
                const totalClassSize = venue.criticalClasses.reduce(
                    (sum, cls) => sum + cls.size,
                    0,
                );
                // Determine marker size and color based on crowd level
                const crowdLevel =
                    totalClassSize < 50
                        ? "low"
                        : totalClassSize < 150
                          ? "medium"
                          : "high";
                const sizeClass =
                    crowdLevel === "low"
                        ? "size-6"
                        : crowdLevel === "medium"
                          ? "size-8"
                          : "size-10";
                const colorClass =
                    crowdLevel === "low"
                        ? "text-yellow-500 fill-yellow-500"
                        : crowdLevel === "medium"
                          ? "text-orange-500 fill-orange-500"
                          : "text-red-600 fill-red-600";

                return (
                    <MapMarker
                        key={`venue-${venue._id}`}
                        position={[venue.latitude, venue.longitude]}
                        icon={
                            <AlertTriangle
                                className={`${sizeClass} ${colorClass} opacity-70`}
                            />
                        }
                    >
                        <MapTooltip side="top">
                            <div className="text-xs">
                                <div className="font-semibold">
                                    {venue.roomName}
                                </div>
                                <div className="text-muted-foreground mt-1">
                                    {venue.criticalClasses.length} active{" "}
                                    {venue.criticalClasses.length === 1
                                        ? "class"
                                        : "classes"}
                                </div>
                                <div className="text-muted-foreground">
                                    ~{totalClassSize} people
                                </div>
                            </div>
                        </MapTooltip>
                    </MapMarker>
                );
            })}

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
                            }}
                            className="fill-none"
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

            {/* Swipe-up Panel for Route Instructions */}
            {routes.length > 0 && (
                <div
                    ref={panelRef}
                    className="fixed left-0 right-0 bg-background border-t border-border shadow-2xl transition-transform duration-300 ease-in-out z-2000 pointer-events-auto bottom-0"
                    style={{
                        maxHeight: "70vh",
                        transform: isPanelOpen
                            ? "translateY(0)"
                            : "translateY(calc(100% - 60px))",
                    }}
                >
                    {/* Panel Header */}
                    <div
                        className="flex items-center justify-between p-4 cursor-pointer border-b"
                        onClick={() => setIsPanelOpen(!isPanelOpen)}
                    >
                        <div className="flex items-center gap-2">
                            <RouteIcon className="h-5 w-5" />
                            <h3 className="font-semibold">
                                {routes.length} Route
                                {routes.length > 1 ? "s" : ""} Found
                            </h3>
                        </div>
                        {isPanelOpen ? (
                            <ChevronDown className="h-5 w-5" />
                        ) : (
                            <ChevronUp className="h-5 w-5" />
                        )}
                    </div>

                    {/* Panel Content */}
                    <div
                        className="overflow-y-auto"
                        style={{ maxHeight: "calc(45vh - 60px)" }}
                    >
                        {/* Route Tabs */}
                        <div className="flex gap-2 p-4 border-b overflow-x-auto">
                            {routes.map((routeData, index) => {
                                const summary =
                                    routeData.route?.properties?.summary;
                                const distance = summary?.distance || 0;
                                const duration = summary?.duration || 0;
                                const colors = [
                                    "border-green-500 bg-green-50 dark:bg-green-950",
                                    "border-blue-500 bg-blue-50 dark:bg-blue-950",
                                    "border-orange-500 bg-orange-50 dark:bg-orange-950",
                                ];
                                const colorClass =
                                    colors[index] ||
                                    "border-gray-500 bg-gray-50 dark:bg-gray-950";

                                return (
                                    <button
                                        key={index}
                                        onClick={() =>
                                            setSelectedRouteIndex(index)
                                        }
                                        className={`shrink-0 px-4 py-3 rounded-lg border-2 transition-all ${
                                            selectedRouteIndex === index
                                                ? colorClass
                                                : "border-border bg-muted"
                                        }`}
                                    >
                                        <div className="text-xs font-medium mb-1">
                                            Route {index + 1}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {Math.round(duration / 60)} min
                                            </span>
                                            <span>
                                                {Math.round(distance)} m
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            Crowdedness:{" "}
                                            {routeData.penalty_score.toFixed(0)}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Route Explanation */}
                        {routes[selectedRouteIndex]?.explanation && (
                            <div className="p-4 bg-muted/50 border-b">
                                <p className="text-sm leading-relaxed">
                                    {routes[selectedRouteIndex].explanation}
                                </p>
                            </div>
                        )}

                        {/* Turn-by-turn Instructions */}
                        <div className="p-4">
                            {routes[
                                selectedRouteIndex
                            ]?.route?.properties?.segments?.[0]?.steps?.map(
                                (step: any, stepIndex: number) => (
                                    <div
                                        key={stepIndex}
                                        className="flex gap-3 mb-4 last:mb-0"
                                    >
                                        <div className="flex flex-col items-center">
                                            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                                                {stepIndex + 1}
                                            </div>
                                            {stepIndex <
                                                routes[selectedRouteIndex].route
                                                    .properties.segments[0]
                                                    .steps.length -
                                                    1 && (
                                                <div className="w-0.5 h-full bg-border mt-1" />
                                            )}
                                        </div>
                                        <div className="flex-1 pb-2">
                                            <p className="font-medium">
                                                {step.instruction}
                                            </p>
                                            {step.name && step.name !== "-" && (
                                                <p className="text-sm text-muted-foreground">
                                                    on {step.name}
                                                </p>
                                            )}
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {Math.round(step.distance)} m •{" "}
                                                {Math.round(step.duration / 60)}{" "}
                                                min
                                            </p>
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>
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
                    <MapLayersControl className="top-auto right-auto left-1 bottom-20" />

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
