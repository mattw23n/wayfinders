from typing import Union
import httpx
import os
import dotenv
dotenv.load_dotenv()

from models import RouteRequest
from fastapi import FastAPI, HTTPException
from service.mongo import MongoAPIClient

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
    return []


def calculate_penalty(venues: list) -> float:
    """Calculate penalty score based on venue classes"""
    # Your penalty calculation logic here
    return 0.0

# TODO: Create get endpoint to see all venues and their current statuses (ongoing class or no) to visualize with a map


