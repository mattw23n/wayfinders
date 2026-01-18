from typing import Optional, Union
import httpx
import os
import dotenv
import asyncio
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser



dotenv.load_dotenv()

from models import RouteRequest
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from service.mongo import MongoAPIClient
from datetime import datetime

# --- LangChain Setup ---
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
llm = None
explanation_chain = None

if ANTHROPIC_API_KEY:
    # Initialize the LangChain model with Claude
    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        anthropic_api_key=ANTHROPIC_API_KEY,
        temperature=0,
        max_retries=2,
        timeout=15.0,
    )

    # Create a prompt template for ALL routes at once
    prompt_template = ChatPromptTemplate.from_template(
        """
        You are helping a user choose between {num_options} pedestrian route options.
        The 'penalty_score' indicates crowdedness (lower is better - less crowded).

        Here are ALL the route options:

        {all_routes_info}

        Please provide a very short, one-sentence explanation for EACH route in order.
        Format your response EXACTLY as:
        Route 1: [explanation]
        Route 2: [explanation]
        Route 3: [explanation]

        Guidelines:
        - Route 1 is ALWAYS the recommended route (lowest penalty score)
        - For Route 1: Start with "Best choice:" and explain why (e.g., "Best choice: avoids 2 busy venues, only 1 min longer")
        - For other routes: Explain the trade-off compared to Route 1 (e.g., "Faster but passes Main Gym with 80+ people")
        - Mention specific venue names and crowd sizes when relevant
        - Be encouraging and friendly
        - ONE sentence per route maximum
        """
    )

    # Create a chain by piping the prompt to the model
    explanation_chain = prompt_template | llm | StrOutputParser()

# --- FastAPI App ---
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://wayfinders-hnr-2026.vercel.app", "https://wayfinders-six.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mongo = MongoAPIClient()
ORS_BASE_URL = os.getenv("ORS_BASE_URL")
ORS_API_KEY = os.getenv("ORS_API_KEY")

@app.on_event("startup")
async def startup_event():
    """Initialize database indices on startup"""
    await mongo.ensure_geospatial_index('venues')


def format_routes_for_llm(processed_routes: list) -> str:
    """Format all routes into a single string for the LLM"""
    route_descriptions = []
    
    for idx, route_data in enumerate(processed_routes, 1):
        route_summary = route_data.get("route", {}).get("properties", {}).get("summary", {})
        duration_min = round(route_summary.get("duration", 0) / 60, 1)
        distance_m = round(route_summary.get("distance", 0))
        penalty = round(route_data.get("penalty_score", 0))
        critical_venues = route_data.get("critical_venues", [])
        
        # Format critical venues info
        venues_info = ""
        if critical_venues:
            venue_details = []
            for venue in critical_venues[:3]:  # Limit to top 3 for brevity
                venue_name = venue.get('roomName', 'Unknown')
                total_people = sum(cls.get('size', 0) for cls in venue.get('criticalClasses', []))
                venue_details.append(f"{venue_name} ({total_people} people)")
            venues_info = f"\n  Busy venues: {', '.join(venue_details)}"
        
        route_desc = f"""Route {idx}:
  - Duration: {duration_min} minutes
  - Distance: {distance_m} meters
  - Crowdedness Score: {penalty}
  - Busy venues on route: {len(critical_venues)}{venues_info}"""
        
        route_descriptions.append(route_desc)
    
    return "\n\n".join(route_descriptions)


def parse_llm_explanations(llm_response: str, num_routes: int) -> list:
    """Parse LLM response into individual route explanations"""
    explanations = []
    lines = llm_response.strip().split('\n')
    
    for i in range(1, num_routes + 1):
        # Look for "Route X:" pattern
        route_pattern = f"Route {i}:"
        explanation = None
        
        for line in lines:
            if line.strip().startswith(route_pattern):
                # Extract everything after "Route X:"
                explanation = line.split(route_pattern, 1)[1].strip()
                break
        
        # Fallback if parsing fails
        if not explanation:
            if i == 1:
                explanation = "Recommended route with lowest crowdedness."
            else:
                explanation = "Alternative route option."
        
        explanations.append(explanation)
    
    return explanations


async def get_explanations_for_all_routes(processed_routes: list) -> list:
    """
    Uses a single LLM call to generate explanations for all routes
    """
    if not explanation_chain or not processed_routes:
        return ["Explanation not available."] * len(processed_routes)

    try:
        # Format all routes for the LLM
        all_routes_info = format_routes_for_llm(processed_routes)
        
        prompt_input = {
            "num_options": len(processed_routes),
            "all_routes_info": all_routes_info
        }

        # Single LLM call for all routes
        response = await asyncio.wait_for(
            explanation_chain.ainvoke(prompt_input),
            timeout=20.0
        )
        
        # Parse the response into individual explanations
        explanations = parse_llm_explanations(response, len(processed_routes))
        
        return explanations

    except asyncio.TimeoutError:
        print(f"Timeout generating explanations for routes")
        return ["Route explanation timed out."] * len(processed_routes)
    except Exception as e:
        print(f"Error calling LangChain chain: {e}")
        return ["Could not generate explanation due to an error."] * len(processed_routes)


@app.post("/routes/")
async def get_routes(request: RouteRequest, current_datetime: Optional[str] = Query(None, description="Current date and time in ISO format")):
    if not ORS_API_KEY:
        raise HTTPException(status_code=500, detail="ORS API key not configured")
    
    # Parse datetime or use current time
    if current_datetime:
        try:
            current_time = datetime.fromisoformat(current_datetime)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid datetime format. Use ISO format: YYYY-MM-DDTHH:MM:SS")
    else:
        current_time = datetime.now()
    
    # Prepare coordinates for ORS API
    coordinates = [
        [request.start.longitude, request.start.latitude],
        [request.end.longitude, request.end.latitude]
    ]
    payload = {"coordinates": coordinates, "alternative_routes": {"target_count": 3, "weight_factor": 1.5, "share_factor": 0.6}}
    
    # Time the ORS API call
    start_time = datetime.now()
    api_response = await call_ors_api(payload)
    print(f"ORS API call took: {(datetime.now() - start_time).total_seconds():.2f}s")
    
    routes = api_response.get("features", [])
    
    # Time the route processing
    start_time = datetime.now()
    processed_routes = await process_routes(routes, current_time)
    print(f"Route processing took: {(datetime.now() - start_time).total_seconds():.2f}s")
    
    # Time the LLM explanation generation (SINGLE CALL)
    start_time = datetime.now()
    if processed_routes and explanation_chain:
        explanations = await get_explanations_for_all_routes(processed_routes)
        
        # Attach explanations to routes
        for route, explanation in zip(processed_routes, explanations):
            route["explanation"] = explanation
    else:
        for route in processed_routes:
            route["explanation"] = "Explanation not available."
    
    print(f"LLM explanation generation took: {(datetime.now() - start_time).total_seconds():.2f}s")

    return {"routes": processed_routes, "raw_ors_response": api_response}

async def call_ors_api(payload: dict) -> dict:
    """Call OpenRouteService API and return response"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{ORS_BASE_URL}/v2/directions/foot-walking/geojson",
                json=payload,
                headers={"Content-Type": "application/json; charset=utf-8", "Authorization": ORS_API_KEY},
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"Error calling ORS API: {str(e)}")

async def process_routes(routes: list, current_time: datetime) -> list:
    """Process and enrich routes with venue information"""
    processed = []
    today = current_time.strftime("%A")

    for route in routes:
        # Extract coordinates from route
        coordinates = route.get("geometry", {}).get("coordinates", [])

        # Check each coordinate against venues
        nearby_venues = await check_venues_along_route(coordinates)

        # Calculate penalties
        classes_by_venue = await load_classes_by_venue(nearby_venues, today)
        penalty_score = calculate_penalty(
            nearby_venues,
            classes_by_venue,
            current_time
        )
        
        # Get critical venues with their classes
        critical_venues = get_critical_venues(nearby_venues, classes_by_venue, current_time)

        processed.append({
            "route": route,
            "nearby_venues": nearby_venues,
            "critical_venues": critical_venues,
            "penalty_score": penalty_score
        })

    # Sort by penalty score (lower is better)
    processed.sort(key=lambda x: x["penalty_score"])

    return processed

def get_critical_venues(nearby_venues: list, classes_by_venue: dict, current_time: datetime) -> list:
    """
    Get list of venues that have critical classes
    
    Args:
        nearby_venues: List of venues near the route
        classes_by_venue: Dictionary mapping venue_id to list of classes
        current_time: Current datetime
    
    Returns:
        List of critical venues with their critical classes
    """
    critical_venues = []
    
    for venue_data in nearby_venues:
        venue = venue_data['venue']
        venue_id = venue_data['_id']
        
        # Get classes for this venue
        classes = classes_by_venue.get(venue_id, [])
        
        # Find critical classes
        critical_classes = []
        for class_entry in classes:
            if is_class_critical_time(class_entry, current_time):
                critical_classes.append({
                    'class_id': str(class_entry.get('_id')),
                    'startTime': class_entry.get('startTime'),
                    'endTime': class_entry.get('endTime'),
                    'size': class_entry.get('size', 0),
                    'name': class_entry.get('name', 'Unknown Class')
                })
        
        # Only add venue if it has critical classes
        if critical_classes:
            venue_coords = venue.get('location', {}).get('coordinates', [])
            critical_venues.append({
                '_id': str(venue_id),
                'roomName': venue.get('roomName', 'Unknown'),
                'location': {
                    'type': 'Point',
                    'coordinates': venue_coords
                },
                'latitude': venue_coords[1] if len(venue_coords) > 1 else None,
                'longitude': venue_coords[0] if len(venue_coords) > 0 else None,
                'distance': venue_data['distance'],
                'criticalClasses': critical_classes
            })
    
    return critical_venues


async def check_venues_along_route(coordinates: list):
    """Check which venues are near the route coordinates using optimized MongoDB aggregation"""
    if not coordinates:
        return []

    # Use aggregation to find all venues near any coordinate in a single query
    venues = await mongo.find_venues_near_coordinates(
        'venues',
        coordinates,
        50,
    )

    # Build venue list with full data
    nearby_venues = []
    for venue in venues:
        nearby_venues.append({
            'venue': venue,
            '_id': venue.get('_id'),
            'distance': venue.get('distance', 0)
        })

    return nearby_venues

def calculate_penalty(venues: list, classes_by_venue: dict, current_time:datetime) -> float:
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

@app.get("/venues/status")
async def get_venues_status(current_datetime: Optional[str] = Query(None, description="Current date and time in ISO format")):
    """
    Get all venues with their current class status
    Returns venues with information about ongoing or upcoming classes
    """
    try:
        if current_datetime:
            try:
                current_time = datetime.fromisoformat(current_datetime)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid datetime format. Use ISO format: YYYY-MM-DDTHH:MM:SS")
        else:
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