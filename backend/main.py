from typing import Union

from fastapi import FastAPI
from service.mongo import MongoAPIClient

app = FastAPI()

mongo = MongoAPIClient()

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


# TODO: Create get endpoint to see all venues and their current statuses (ongoing class or no) to visualize with a map