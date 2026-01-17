from pydantic import BaseModel
from typing import List


class Coordinates(BaseModel):
    longitude: float
    latitude: float


class RouteRequest(BaseModel):
    start: Coordinates
    end: Coordinates


class RouteResponse(BaseModel):
    routes: List[dict]