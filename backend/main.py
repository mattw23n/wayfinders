from typing import Union
import httpx
import os
import dotenv
dotenv.load_dotenv()

from models import RouteRequest
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from service.mongo import MongoAPIClient

from datetime import datetime

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mongo = MongoAPIClient()
ORS_BASE_URL = os.getenv("ORS_BASE_URL")
ORS_API_KEY = os.getenv("ORS_API_KEY")

@app.post("/routes/")
async def get_routes(request: RouteRequest):
    if not ORS_API_KEY:
        raise HTTPException(status_code=500, detail="ORS API key not configured")

    # Prepare coordinates for ORS API
    coordinates = [
        [request.start.longitude, request.start.latitude],
        [request.end.longitude, request.end.latitude]
    ]
    
    # Prepare request payload
    payload = {
        "coordinates": coordinates,
        "alternative_routes": {
            "target_count": 3,
            "weight_factor": 1.5,
            "share_factor": 0.6
        }
    }
    
    # Call OpenRouteService API
    api_response = await call_ors_api(payload)

    # Extract routes from response
    routes = api_response.get("features", [])
    
    # Process routes (all your business logic here)
    processed_routes = await process_routes(routes)

    return {
        "routes": processed_routes,
        "raw_response": api_response
    }

async def call_ors_api(payload: dict) -> dict:
    """Call OpenRouteService API and return response"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{ORS_BASE_URL}/v2/directions/foot-walking/geojson",
                json=payload,
                headers={
                    "Content-Type": "application/json; charset=utf-8",
                    "Authorization": ORS_API_KEY
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"Error calling ORS API: {str(e)}")

async def process_routes(routes: list) -> list:
    """Process and enrich routes with venue information"""
    processed = []
    current_time = datetime.now()
    # today = current_time.strftime("%A")
    today = "Monday"

    for route in routes:
        # Extract coordinates from route
        coordinates = route.get("geometry", {}).get("coordinates", [])

        # Check each coordinate against venues and collect results
        nearby_venues = []
        async for venue in check_venues_along_route(coordinates):
            nearby_venues.append(venue)

        # Calculate penalties
        classes_by_venue = await load_classes_by_venue(nearby_venues, today)
        penalty_score = calculate_penalty(
            nearby_venues,
            classes_by_venue,
            current_time,
        )

        processed.append({
            "route": route,
            "nearby_venues": nearby_venues,
            "penalty_score": penalty_score
        })

    # Sort by penalty score (lower is better)
    processed.sort(key=lambda x: x["penalty_score"])

    return processed


async def check_venues_along_route(coordinates: list):
    """Check which venues are near the route coordinates using MongoDB geospatial queries"""
    seen_venue_ids = set()  # Track venues we've already found to avoid duplicates

    for coord in coordinates:
        # coord is [longitude, latitude] format from OpenRouteService
        longitude = coord[0]
        latitude = coord[1]

        # Query MongoDB for venues within 50m of this coordinate
        venues = await mongo.find_venues_near(
            'venues',
            longitude,
            latitude,
            50,
        )

        # Yield unique venues with calculated distance
        for venue in venues:
            venue_id = venue.get('_id')

            # Skip if we've already added this venue
            if venue_id not in seen_venue_ids:
                seen_venue_ids.add(venue_id)

                # Calculate actual distance between coordinate and venue
                venue_coords = venue.get('location', {}).get('coordinates', [])
                if venue_coords:
                    venue_lon = venue_coords[0]
                    venue_lat = venue_coords[1]
                    distance = calculate_distance(latitude, longitude, venue_lat, venue_lon)
                else:
                    distance = 0  # Fallback if location data is missing

                yield {
                    'venue': venue,
                    '_id': venue_id,
                    'distance': distance
                }

def calculate_penalty(venues: list, classes_by_venue: dict, current_time: datetime) -> float:
    """Calculate penalty score based on venue classes"""
    if not venues:
        return 0.0
    
    total_penalty = 0.0
    
    for venue_data in venues:
        distance = venue_data['distance']
        venue_id = venue_data['_id']
        
        # Query MongoDB for today's class schedule at this venue
        classes = classes_by_venue.get(venue_id, [])
        
        # print(f"Classes for venue {venue_id} on {today}: {classes}")
        
        for class_entry in classes:
            # Check if class is starting or ending within 15 minutes
            if is_class_critical_time(class_entry, current_time):
                class_size = class_entry.get('size', 0)
                
                # Calculate penalty: class_size * (50 / actual_distance)
                # Avoid division by zero
                distance_factor = 50 / max(distance, 1)
                penalty = class_size * distance_factor
                
                # print(f"Penalty for class {class_entry.get('_id')} at venue {venue_id}: {penalty}")
                
                total_penalty += penalty
    
    return total_penalty


async def load_classes_by_venue(venues: list, today: str) -> dict:
    """Load classes for all venue IDs in one query and group by venueId."""
    if not venues:
        return {}

    venue_ids = list({venue["_id"] for venue in venues})

    classes = await mongo.get_venues_classes_for_day(
        venue_ids,
        today,
    )

    classes_by_venue = {}
    for class_entry in classes:
        venue_id = class_entry.get("venueId")
        if venue_id is None:
            continue
        classes_by_venue.setdefault(venue_id, []).append(class_entry)

    return classes_by_venue

def is_class_critical_time(class_entry: dict, current_time: datetime) -> bool:
    """
    Check if class is within 15 minutes of starting or ending
    
    Args:
        class_entry: MongoDB class document with start_time and end_time
        current_time: Current datetime
    
    Returns:
        True if class is starting or ending within 15 minutes
    """
    # Assuming class_entry has 'start_time' and 'end_time' in format "HH:MM"
    start_time_str = class_entry.get('startTime')
    end_time_str = class_entry.get('endTime')
    
    if not start_time_str or not end_time_str:
        return False
    
    # Parse time strings to datetime objects for today
    start_hour = int(start_time_str[:2])
    start_minute = int(start_time_str[2:4])
    start_time = current_time.replace(
        hour=start_hour,
        minute=start_minute,
        second=0,
        microsecond=0
    )

    end_hour = int(end_time_str[:2])
    end_minute = int(end_time_str[2:4])
    end_time = current_time.replace(
        hour=end_hour,
        minute=end_minute,
        second=0,
        microsecond=0
    )
    
    # Check if within 15 minutes of start time
    time_until_start = (start_time - current_time).total_seconds() / 60
    if 0 <= time_until_start <= 15:
        return True
    
    # Check if within 15 minutes of end time
    time_until_end = (end_time - current_time).total_seconds() / 60
    if 0 <= time_until_end <= 15:
        return True
    
    # Check if class just started (within 15 minutes after start)
    time_since_start = (current_time - start_time).total_seconds() / 60
    if 0 <= time_since_start <= 15:
        return True
    
    return False

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two coordinates in meters using Haversine formula
    
    Args:
        lat1: Latitude of first point
        lon1: Longitude of first point
        lat2: Latitude of second point
        lon2: Longitude of second point
    
    Returns:
        Distance in meters
    """
    from math import radians, sin, cos, sqrt, atan2
    
    R = 6371000  # Earth's radius in meters
    
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)
    
    a = sin(delta_lat/2)**2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    distance = R * c
    return round(distance, 2)

# TODO: Create get endpoint to see all venues and their current statuses (ongoing class or no) to visualize with a map
@app.get("/venues/status")
async def get_venues_status():
    """
    Get all venues with their current class status
    Returns venues with information about ongoing or upcoming classes
    """
    try:
        current_time = datetime.now()
        today = current_time.strftime("%A")
        
        # Calculate time window (current time ± 15 minutes)
        current_minutes = current_time.hour * 60 + current_time.minute
        start_window = current_minutes - 15
        end_window = current_minutes + 15
        
        # Convert to "HHMM" format strings for comparison
        def minutes_to_hhmm(minutes):
            hours = minutes // 60
            mins = minutes % 60
            return f"{hours:02d}{mins:02d}"
        
        # Use aggregation pipeline for efficient processing
        pipeline = [
            {
                '$lookup': {
                    'from': 'classes',
                    'let': {'venue_id': '$_id'},
                    'pipeline': [
                        {
                            '$match': {
                                '$expr': {
                                    '$and': [
                                        {'$eq': ['$venueId', '$$venue_id']},
                                        {'$eq': ['$day', today]}
                                    ]
                                }
                            }
                        }
                    ],
                    'as': 'todayClasses'
                }
            },
            {
                '$addFields': {
                    'criticalClasses': {
                        '$filter': {
                            'input': '$todayClasses',
                            'as': 'class',
                            'cond': {
                                '$or': [
                                    # Check if within 15 min of start
                                    {
                                        '$and': [
                                            {'$gte': ['$$class.startTime', minutes_to_hhmm(max(0, start_window))]},
                                            {'$lte': ['$$class.startTime', minutes_to_hhmm(min(1439, end_window))]}
                                        ]
                                    },
                                    # Check if within 15 min of end
                                    {
                                        '$and': [
                                            {'$gte': ['$$class.endTime', minutes_to_hhmm(max(0, start_window))]},
                                            {'$lte': ['$$class.endTime', minutes_to_hhmm(min(1439, end_window))]}
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            {
                '$addFields': {
                    'hasCriticalClass': {'$gt': [{'$size': '$criticalClasses'}, 0]}
                }
            },
            # Filter to only include venues with critical classes
            {
                '$match': {
                    'hasCriticalClass': True
                }
            },
            {
                '$project': {
                    '_id': {'$toString': '$_id'},
                    'roomName': 1,
                    'location': 1,
                    'latitude': {'$arrayElemAt': ['$location.coordinates', 1]},
                    'longitude': {'$arrayElemAt': ['$location.coordinates', 0]},
                    'criticalClasses': {
                        '$map': {
                            'input': '$criticalClasses',
                            'as': 'class',
                            'in': {
                                'class_id': {'$toString': '$$class._id'},
                                'startTime': '$$class.startTime',
                                'endTime': '$$class.endTime',
                                'size': '$$class.size',
                                'name': {'$ifNull': ['$$class.name', 'Unknown Class']}
                            }
                        }
                    }
                }
            }
        ]
        
        cursor = mongo.get_collection('venues').aggregate(pipeline)
        critical_venues = await cursor.to_list(length=None)
        
        return {
            'total_critical_venues': len(critical_venues),
            'current_time': current_time.isoformat(),
            'day': today,
            'venues': critical_venues
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching venues: {str(e)}")
