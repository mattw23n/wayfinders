"use client";

import { useEffect, useRef, useState } from "react";
import {
    Map,
    MapLayers,
    MapLayersControl,
    MapLocateControl,
    MapMarker,
    MapMarkerClusterGroup,
    MapPolyline,
    MapSearchControl,
    MapTileLayer,
    MapTooltip,
    MapZoomControl,
} from "@/components/ui/map";
import { Button } from "@/components/ui/button";
import {
    ChevronDown,
    ChevronUp,
    Clock,
    MapPin,
    Navigation,
    Route as RouteIcon,
    Volume2,
    X,
} from "lucide-react";
import {
    type RouteData as NavRouteData,
    useNavigation,
} from "@/hooks/use-navigation";
import { NavigationOverlay } from "@/_components/navigation-overlay";
import type { LatLngExpression } from "leaflet";
// import L from "leaflet";
import type { PlaceFeature } from "@/components/ui/place-autocomplete";
import { useMap } from "react-leaflet";
import type { NearbyVenue, RouteData, RouteStep } from "@/types/route";

interface WayfindingMapProps {
    center?: [number, number];
    zoom?: number;
}

interface Location {
    name: string;
    address?: string;
    coordinates: [number, number];
}

type VenueStatus = Omit<NearbyVenue, "distance_to_route">;

// Singapore bounding box: [minLon, minLat, maxLon, maxLat]
const SINGAPORE_BBOX: [number, number, number, number] = [
    103.6, 1.15, 104.1, 1.47,
];

function MapContent() {
    const map = useMap();
    const PANEL_COLLAPSED_HEIGHT = 60;
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
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
    const [panelHeight, setPanelHeight] = useState(0);
    const panelRef = useRef<HTMLDivElement>(null);
    const [isLoadingCrowdedVenues, setIsLoadingCrowdedVenues] = useState(false);
    const [isLocatingUser, setIsLocatingUser] = useState(false);

    // Navigation state
    const {
        isNavigating,
        currentStepIndex,
        currentStep,
        totalSteps,
        distanceToNextWaypoint,
        userPosition: navUserPosition,
        accuracy,
        error: navError,
        startNavigation,
        stopNavigation,
        skipToNextStep,
        repeatCurrentInstruction,
    } = useNavigation();

    // Create custom panes for proper layering
    useEffect(() => {
        if (typeof window !== "undefined") {
            // Route pane - above heatmap markers (600) but below location markers
            const routePane = map.getPane("routePane");
            if (!routePane) {
                const pane = map.createPane("routePane");
                pane.style.zIndex = "650"; // Higher than markerPane (600)
            }

            // Location marker pane - above routes
            const locationMarkerPane = map.getPane("locationMarkerPane");
            if (!locationMarkerPane) {
                const pane = map.createPane("locationMarkerPane");
                pane.style.zIndex = "700"; // Higher than routePane (650)
            }
        }
    }, [map]);

    useEffect(() => {
        // Import L dynamically only on client side
        if (panelRef.current && typeof window !== "undefined") {
            import("leaflet").then((L) => {
                L.DomEvent.disableScrollPropagation(panelRef.current!);
                L.DomEvent.disableClickPropagation(panelRef.current!);
            });
        }
    }, [routes]);

    useEffect(() => {
        if (!panelRef.current || routes.length === 0) {
            setPanelHeight(0);
            return;
        }

        const panelElement = panelRef.current;
        const updatePanelHeight = () => {
            setPanelHeight(panelElement.getBoundingClientRect().height);
        };

        updatePanelHeight();

        if (typeof ResizeObserver === "undefined") {
            return;
        }

        const resizeObserver = new ResizeObserver(updatePanelHeight);
        resizeObserver.observe(panelElement);
        return () => resizeObserver.disconnect();
    }, [routes.length]);

    useEffect(() => {
        const container = map.getContainer();
        const visiblePanelHeight =
            routes.length > 0
                ? isPanelOpen
                    ? panelHeight
                    : PANEL_COLLAPSED_HEIGHT
                : 0;

        container.style.setProperty(
            "--route-panel-offset",
            `${visiblePanelHeight}px`,
        );

        return () => {
            container.style.removeProperty("--route-panel-offset");
        };
    }, [map, panelHeight, isPanelOpen, routes.length]);

    // Fetch crowded venues on mount
    useEffect(() => {
        const fetchCrowdedVenues = async () => {
            setIsLoadingCrowdedVenues(true);
            try {
                const response = await fetch(
                    `${API_BASE_URL}/venues/status?current_datetime=${encodeURIComponent(simulationTime)}`,
                );
                if (response.ok) {
                    const data = await response.json();
                    console.log(data);
                    setCrowdedVenues(data.venues || []);
                }
            } catch (error) {
                console.error("Error fetching crowded venues:", error);
            } finally {
                setIsLoadingCrowdedVenues(false);
            }
        };

        fetchCrowdedVenues();
        // Refresh every 5 minutes
        const interval = setInterval(fetchCrowdedVenues, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [simulationTime, API_BASE_URL]);

    const handleStartNavigation = async (routeData: NavRouteData) => {
        setIsLocatingUser(true);
        
        try {
            // Request user location
            map.locate({ 
                setView: false, 
                maxZoom: map.getMaxZoom(),
                enableHighAccuracy: true,
                timeout: 10000
            });

            // Wait for location
            await new Promise<void>((resolve, reject) => {
                const onLocationFound = (location: any) => {
                    map.off('locationfound', onLocationFound);
                    map.off('locationerror', onLocationError);
                    
                    // Fly to user's location
                    map.flyTo([location.latitude, location.longitude], 18, {
                        duration: 1,
                        easeLinearity: 0.5,
                    });
                    
                    // Start navigation
                    startNavigation(routeData);
                    setIsLocatingUser(false);
                    resolve();
                };

                const onLocationError = (error: any) => {
                    map.off('locationfound', onLocationFound);
                    map.off('locationerror', onLocationError);
                    
                    console.error('Location error:', error);
                    setIsLocatingUser(false);
                    
                    // Still start navigation, but show a warning
                    alert('Could not get your location. Navigation will start from the route start point.');
                    
                    // Fly to start location instead
                    if (startLocation) {
                        map.flyTo(startLocation.coordinates, 18, {
                            duration: 1,
                            easeLinearity: 0.5,
                        });
                    }
                    
                    startNavigation(routeData);
                    reject(error);
                };

                map.once('locationfound', onLocationFound);
                map.once('locationerror', onLocationError);
            });
        } catch (error) {
            // Error already handled in the promise
            console.error('Navigation start error:', error);
        }
    };

    const handleStartSelect = (feature: PlaceFeature) => {
        const location: Location = {
            name: feature.properties.name || "Start Location",
            address: feature.properties.name || "",
            coordinates: feature.geometry.coordinates.toReversed() as [
                number,
                number,
            ],
        };

        setStartLocation(location);
        map.flyTo(location.coordinates, map.getZoom(), {
            duration: 1,
            easeLinearity: 0.5,
        });
    };

    const handleEndSelect = (feature: PlaceFeature) => {
        const location: Location = {
            name: feature.properties.name || "End Location",
            address: feature.properties.name || "",
            coordinates: feature.geometry.coordinates.toReversed() as [
                number,
                number,
            ],
        };

        setEndLocation(location);
        map.flyTo(location.coordinates, map.getZoom(), {
            duration: 1,
            easeLinearity: 0.5,
        });
    };

    const handleCalculateRoute = async () => {
        if (!startLocation || !endLocation) return;

        setRoutes([]);
        setIsPanelOpen(false);

        setLoading(true);
        try {
            const response = await fetch(
                `${API_BASE_URL}/routes/?current_datetime=${encodeURIComponent(simulationTime)}`,
                {
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
                },
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Routes received:", data);
            setRoutes(data.routes || []);
            setSelectedRouteIndex(0);
            setIsPanelOpen(true);

            if (data.routes && data.routes.length > 0) {
                const firstRoute = data.routes[0];
                const coordinates =
                    firstRoute.route?.geometry?.coordinates || [];

                if (coordinates.length > 0 && typeof window !== "undefined") {
                    import("leaflet").then((L) => {
                        const bounds = L.latLngBounds(
                            coordinates.map((coord: [number, number]) => [
                                coord[1],
                                coord[0],
                            ]),
                        );

                        map.flyToBounds(bounds, {
                            padding: [50, 50],
                            duration: 0.7,
                            easeLinearity: 0.5,
                            maxZoom: 17,
                        });
                    });
                }
            }
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
                className="top-4 left-4 z-9999"
                placeholder="Search start location..."
                onPlaceSelect={handleStartSelect}
                bbox={SINGAPORE_BBOX}
            />

            {/* Second Search Control - END */}
            <MapSearchControl
                className="top-15 left-4"
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
                    <Clock className="h-5 w-5" />
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

            {/* Syncing Indicator */}
            {isLoadingCrowdedVenues && (
                <div
                    className={
                        "absolute left-4 z-1000 flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg shadow-md pointer-events-auto transition-all duration-300 bottom-[calc(var(--route-panel-offset,0px)+4rem)]"
                    }
                >
                    <svg
                        className="animate-spin h-4 w-4 text-primary"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    <span className="text-sm font-medium">
                        Syncing venues...
                    </span>
                </div>
            )}

            <div
                className={`absolute right-4 z-1000 flex pointer-events-auto gap-3 bottom-[calc(var(--route-panel-offset,0px)+4rem)] ${
                    isPanelOpen ? "flex-row items-end" : "flex-col items-end"
                }`}
            >
                <MapZoomControl
                    orientation={isPanelOpen ? "horizontal" : "vertical"}
                    className="!static !top-auto !right-auto !bottom-auto !left-auto"
                />
                <MapLocateControl className="!static !top-auto !right-auto !bottom-auto !left-auto" />
                <MapLayersControl className="!static !top-auto !right-auto !bottom-auto !left-auto" />
            </div>

            {/* Start Location Marker */}
            {startLocation && (
                <MapMarker
                    key={`start-${startLocation.coordinates[0]}-${startLocation.coordinates[1]}`}
                    position={startLocation.coordinates as LatLngExpression}
                    icon={
                        <svg
                            version="1.0"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 512.000000 512.000000"
                            preserveAspectRatio="xMidYMid meet"
                            className="h-8 w-8"
                        >
                            <g
                                transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)"
                                fill="#000000"
                                stroke="none"
                            >
                                <path
                                    d="M2425 5110 c-231 -17 -471 -86 -683 -195 -540 -279 -861 -762 -953
                                    -1435 -17 -124 -14 -423 5 -555 21 -139 59 -294 101 -410 74 -207 113 -267
                                    901 -1406 417 -604 761 -1098 764 -1098 3 0 345 491 760 1091 637 920 765
                                    1112 821 1224 140 279 201 552 201 899 1 567 -205 1076 -570 1415 -234 217
                                    -543 375 -860 441 -79 16 -342 42 -377 37 -5 0 -55 -4 -110 -8z m277 -1181
                                    c29 -6 91 -29 137 -51 199 -95 331 -306 331 -528 0 -173 -73 -336 -202 -448
                                    -158 -140 -382 -184 -578 -116 -103 36 -182 87 -248 159 -63 69 -95 123 -128
                                    221 -36 106 -39 245 -7 349 43 136 148 272 268 344 116 70 289 99 427 70z"
                                />
                            </g>
                        </svg>
                    }
                    pane="locationMarkerPane"
                >
                    <MapTooltip side="top">Start</MapTooltip>
                </MapMarker>
            )}

            {/* End Location Marker */}
            {endLocation && (
                <MapMarker
                    key={`end-${endLocation.coordinates[0]}-${endLocation.coordinates[1]}`}
                    position={endLocation.coordinates as LatLngExpression}
                    icon={
                        <svg
                            version="1.0"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 512.000000 512.000000"
                            preserveAspectRatio="xMidYMid meet"
                            className="h-8 w-8"
                        >
                            <g
                                transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)"
                                fill="#000000"
                                stroke="none"
                            >
                                <path
                                    d="M660 4994 c-46 -20 -77 -50 -103 -99 l-22 -40 0 -2295 0 -2295 25
                                    -45 c67 -119 225 -147 327 -57 77 67 73 13 73 936 l0 824 248 -6 c354 -9 546
                                    -32 842 -102 375 -87 615 -110 1070 -102 425 7 761 49 1101 136 202 52 262 75
                                    305 119 68 70 65 7 62 1338 l-3 1199 -22 40 c-39 74 -105 115 -182 115 -22 0
                                    -109 -18 -193 -39 -394 -102 -844 -150 -1293 -138 -317 9 -513 33 -785 97
                                    -324 77 -509 99 -877 107 l-273 6 0 74 c0 112 -37 180 -122 224 -45 23 -128
                                    25 -178 3z m935 -539 c72 -8 149 -18 172 -21 l43 -6 2 -400 3 -401 110 -23
                                    c61 -12 160 -34 220 -48 111 -26 320 -59 453 -71 l72 -7 0 398 0 399 337 0
                                    c186 0 377 3 426 8 l87 7 0 -401 0 -400 58 6 c249 29 499 75 677 125 58 17
                                    107 30 110 30 3 0 4 -168 3 -372 l-3 -373 -95 -27 c-139 -41 -414 -94 -580
                                    -114 -80 -9 -151 -18 -157 -20 -10 -3 -13 -92 -13 -402 l0 -399 -82 -7 c-163
                                    -13 -476 -19 -620 -11 l-148 7 0 399 0 398 -32 5 c-18 3 -96 12 -173 21 -144
                                    16 -188 24 -482 91 l-173 38 0 372 0 372 -82 11 c-172 24 -280 32 -520 38
                                    l-248 6 0 400 0 400 253 -6 c138 -3 311 -13 382 -22z m33 -1549 c73 -9 144
                                    -19 158 -22 l24 -6 0 -399 0 -399 -22 5 c-82 19 -313 37 -550 42 l-278 6 0
                                    400 0 400 268 -6 c147 -3 327 -13 400 -21z"
                                />
                                <path
                                    d="M3355 3478 c-60 -5 -239 -8 -398 -6 l-287 3 0 -371 0 -372 138 -7
c135 -8 498 -1 640 12 l72 6 0 373 0 374 -27 -1 c-16 -1 -77 -6 -138 -11z"
                                />
                            </g>
                        </svg>
                    }
                    pane="locationMarkerPane"
                >
                    <MapTooltip side="top">End</MapTooltip>
                </MapMarker>
            )}

            {/* Crowded Venues Heatmap */}
            <MapMarkerClusterGroup
                maxClusterRadius={30} // Combine markers within 30 pixels
                spiderfyOnMaxZoom={true}
                showCoverageOnHover={false}
                zoomToBoundsOnClick={true}
                icon={(markerCount) => {
                    // Aggregate total class size for the cluster
                    const clusterSize = markerCount;

                    // Determine cluster styling based on size
                    const sizeClass =
                        clusterSize < 3
                            ? "size-8"
                            : clusterSize < 10
                              ? "size-10"
                              : "size-12";

                    const colorClass =
                        clusterSize < 3
                            ? "bg-yellow-500 text-white"
                            : clusterSize < 10
                              ? "bg-orange-500 text-white"
                              : "bg-red-600 text-white";

                    return (
                        <div
                            className={`${sizeClass} ${colorClass} rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white`}
                        >
                            {markerCount}
                        </div>
                    );
                }}
            >
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
                    const bgColor =
                        crowdLevel === "low"
                            ? "bg-yellow-500"
                            : crowdLevel === "medium"
                              ? "bg-orange-500"
                              : "bg-red-600";

                    return (
                        <MapMarker
                            key={`venue-${venue._id}`}
                            position={[venue.latitude, venue.longitude]}
                            icon={
                                <div
                                    className={`${sizeClass} ${bgColor} rounded-full shadow-md border-2 border-white opacity-70`}
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
            </MapMarkerClusterGroup>

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

                    const colors = ["#00c951", "#2b7fff", "#ad46ff"];
                    const color = colors[index] || "#6b7280";

                    const weight = selectedRouteIndex === index ? 6 : 3;
                    const opacity = selectedRouteIndex === index ? 1 : 0.6;

                    return (
                        <MapPolyline
                            key={`route-${index}`}
                            positions={positions}
                            pathOptions={{
                                color,
                                weight,
                                opacity,
                                pane: "routePane",
                            }}
                            className=""
                        />
                    );
                })}

            {/* Calculate Route Button */}
            <div className="absolute top-26 left-4 z-1000">
                <Button
                    className={
                        !startLocation || !endLocation ? "bg-gray-300" : ""
                    }
                    size="lg"
                    onClick={handleCalculateRoute}
                    disabled={!startLocation || !endLocation || loading}
                >
                    {loading ? (
                        <>
                            <svg
                                className="animate-spin mr-2 h-5 w-5"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                ></circle>
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                            </svg>
                            Calculating...
                        </>
                    ) : (
                        <>
                            <Navigation className="mr-2 h-5 w-5" />
                            Calculate Route
                        </>
                    )}
                </Button>
            </div>

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
                                    "border-purple-500 bg-purple-50 dark:bg-purple-950",
                                ];
                                const colorClass =
                                    colors[index] ||
                                    "border-gray-500 bg-gray-50 dark:bg-gray-950";

                                return (
                                    <div
                                        key={index}
                                        className={`shrink-0 px-4 py-3 rounded-lg border-2 transition-all ${
                                            selectedRouteIndex === index
                                                ? colorClass
                                                : "border-border bg-muted"
                                        }`}
                                        onClick={() =>
                                            setSelectedRouteIndex(index)
                                        }
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
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="mt-2 w-full cursor-pointer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleStartNavigation(
                                                    routeData as NavRouteData,
                                                );
                                            }}
                                            disabled={isNavigating || isLocatingUser}
                                        >
                                            <Volume2 className="h-3 w-3 mr-1" />
                                            Start Navigation
                                        </Button>
                                    </div>
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
                                (step: RouteStep, stepIndex: number) => (
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

            {/* Navigation Overlay */}
            {isNavigating && (
                <NavigationOverlay
                    currentStepIndex={currentStepIndex}
                    totalSteps={totalSteps}
                    currentStep={currentStep}
                    distanceToNextWaypoint={distanceToNextWaypoint}
                    accuracy={accuracy}
                    onStop={stopNavigation}
                    onSkip={skipToNextStep}
                    onRepeat={repeatCurrentInstruction}
                />
            )}

            {/* Navigation User Position Marker */}
            {isNavigating && navUserPosition && (
                <MapMarker
                    position={navUserPosition as LatLngExpression}
                    icon={
                        <div className="relative">
                            <div className="size-4 bg-blue-500 rounded-full border-2 border-white shadow-lg" />
                            <div className="absolute inset-0 size-4 bg-blue-500 rounded-full animate-ping opacity-75" />
                        </div>
                    }
                    zIndexOffset={2000}
                />
            )}

            {/* Navigation Error Toast */}
            {navError && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-3000 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg">
                    {navError}
                </div>
            )}
        </>
    );
}

export function WayfindingMap({
    center = [1.2959854, 103.7766606],
    zoom = 16,
}: WayfindingMapProps) {
    return (
        <div className="relative w-full h-screen">
            <Map center={center} zoom={zoom} className="w-full h-full">
                <MapLayers defaultTileLayer="Light">
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
                    <MapContent />
                </MapLayers>
            </Map>
        </div>
    );
}
