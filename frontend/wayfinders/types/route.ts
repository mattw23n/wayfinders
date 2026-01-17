export interface RouteStep {
  instruction: string
  name: string
  distance: number
  duration: number
  type: number
  way_points: [number, number]
}

export interface RouteGeometry {
  coordinates: [number, number][] // [lng, lat] pairs
  type: "LineString"
}

export interface RouteSegment {
  distance: number
  duration: number
  steps: RouteStep[]
}

export interface RouteSummary {
  distance: number
  duration: number
}

export interface RouteProperties {
  segments: RouteSegment[]
  summary: RouteSummary
  way_points: [number, number]
}

export interface Route {
  geometry: RouteGeometry
  properties: RouteProperties
  type: "Feature"
  bbox?: [number, number, number, number]
}

export interface NearbyVenue {
  _id: string
  roomName: string
  latitude: number
  longitude: number
  distance_to_route: number
  criticalClasses: Array<{
    class_id: string
    startTime: string
    endTime: string
    size: number
    name: string
  }>
}

export interface RouteData {
  route: Route
  nearby_venues: NearbyVenue[]
  penalty_score: number
  explanation: string
}