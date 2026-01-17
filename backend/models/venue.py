from pydantic import BaseModel, Field
from typing import List


class Location(BaseModel):
    """GeoJSON Point location."""
    type: str = Field(default="Point")
    coordinates: List[float]  # [longitude, latitude]


class VenueCreate(BaseModel):
    """Input model for creating a venue."""
    roomName: str
    floor: int
    location: Location

    class Config:
        json_schema_extra = {
            "example": {
                "roomName": "Lecture Theatre 17",
                "floor": 1,
                "location": {
                    "type": "Point",
                    "coordinates": [103.77401107931558, 1.2936062312700383]
                }
            }
        }


class VenueResponse(BaseModel):
    """Output model for retrieving a venue."""
    id: str = Field(alias="_id")
    roomName: str
    floor: int
    location: Location

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "_id": "LT17",
                "roomName": "Lecture Theatre 17",
                "floor": 1,
                "location": {
                    "type": "Point",
                    "coordinates": [103.77401107931558, 1.2936062312700383]
                }
            }
        }