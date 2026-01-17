from typing import Union
import httpx
import os
import dotenv
dotenv.load_dotenv()

from models import RouteRequest
from fastapi import FastAPI, HTTPException
from service.mongo import MongoAPIClient

from datetime import datetime, timedelta

app = FastAPI()

mongo = MongoAPIClient()
ORS_BASE_URL = os.getenv("ORS_BASE_URL")
ORS_API_KEY = os.getenv("ORS_API_KEY")

@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: Union[str, None] = None):
    return {"item_id": item_id, "q": q}


# TODO: Create endpoint to process routing requests

# @app.post("/route/")
# def create_route(request: RouteRequest):
#     # Call OpenRouteService API to get route
#     # Get list of waypoints from request
#     # For each alternative route,
#       # For each checkpoint, 
#         # Check if the checkpoint is within 50ms of ANY of the venues, store distance
#     # Return all venues along with distance for the entire route
#     # Calculate penalty by checking if the venue has a class that is about to end or about to start (15 mins), penalty score = class size * (50/actual distance)
#     # Sort routes based on penalty score, return the best route to the user

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
    processed_routes = process_routes(routes)
    
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

def process_routes(routes: list) -> list:
    """Process and enrich routes with venue information"""
    processed = []
    
    for route in routes:
        # Extract coordinates from route
        coordinates = route.get("geometry", {}).get("coordinates", [])
        
        # Check each coordinate against venues
        nearby_venues = check_venues_along_route(coordinates)
        
        # Calculate penalties
        penalty_score = calculate_penalty(nearby_venues)
        
        processed.append({
            "route": route,
            "nearby_venues": nearby_venues,
            "penalty_score": penalty_score
        })
    
    # Sort by penalty score (lower is better)
    processed.sort(key=lambda x: x["penalty_score"])
    
    return processed


def check_venues_along_route(coordinates: list) -> list:
    """Check which venues are near the route coordinates"""
    # Your venue checking logic here
    return [ {"_id": "COM1-0212", "roomName": "Seminar Room 3", "floor": 2, "distance": 10} ]


def calculate_penalty(venues: list) -> float:
    """Calculate penalty score based on venue classes"""
    if not venues:
        return 0.0
    
    total_penalty = 0.0
    current_time = datetime.now()
    # today = current_time.strftime("%A")
    today = "Monday" 
    
    for venue_data in venues:
        distance = venue_data['distance']
        venue_id = venue_data['_id']
        
        # Query MongoDB for today's class schedule at this venue
        classes = mongo.get_venue_classes_for_day(venue_id, today)
        
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

# TODO: Create get endpoint to see all venues and their current statuses (ongoing class or no) to visualize with a map


