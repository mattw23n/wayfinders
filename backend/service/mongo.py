import os
from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import dotenv_values


class MongoAPIClient:
    def __init__(self, mongo_uri: Optional[str] = None, db_name: Optional[str] = None):
        """
        Initialize MongoDB client.

        Args:
            mongo_uri: MongoDB connection string. Defaults to MONGO_URI env var.
            db_name: Database name. Defaults to MONGO_DB_NAME env var.
        """
        config = dotenv_values()
        
        self.mongo_uri = mongo_uri or config.get("MONGO_DATABASE_URL") or os.getenv('MONGO_DATABASE_URL', 'mongodb://localhost:27017')
        self.db_name = db_name or config.get('MONGO_DB_NAME') or os.getenv('MONGO_DB_NAME', 'wayfinders')

        self.client = AsyncIOMotorClient(self.mongo_uri)
        self.db = self.client[self.db_name]
        
        self.classes_collection = self.db['classes']  # or whatever your classes collection name is
        self.venues_collection = self.db['venues'] 

    def get_collection(self, collection_name: str):
        """Get a collection by name."""
        return self.db[collection_name]

    async def find_venues_near(self, collection_name: str, longitude: float, latitude: float, max_distance_meters: int) -> List[Dict[str, Any]]:
        """
        Find all venues within max_distance_meters from the given coordinate.
        Requires a 2dsphere geospatial index on the location.coordinates field.

        Args:
            collection_name: Collection to query
            longitude: Longitude of the center point
            latitude: Latitude of the center point
            max_distance_meters: Maximum distance in meters

        Returns:
            List of venues sorted by distance (closest first)
        """
        query = {
            "location.coordinates": {
                "$near": {
                    "$geometry": {
                        "type": "Point",
                        "coordinates": [longitude, latitude]
                    },
                    "$maxDistance": max_distance_meters
                }
            }
        }
        cursor = self.db[collection_name].find(query)
        results = await cursor.to_list(length=None)
        for doc in results:
            doc['_id'] = str(doc['_id'])
        return results

    def close(self):
        self.client.close()
        
    async def get_venue_classes_for_day(self, venue_id, day: str):
        """
        Get all classes for a specific venue on a given day
        
        Args:
            venue_id: Venue ID
            day: Day name (e.g., "Monday", "Tuesday")
        
        Returns:
            List of class documents for that day
        """
        query = {
            "venueId": venue_id,
            "day": day
        }
        
        cursor = self.classes_collection.find(query)
        return await cursor.to_list(length=None)

    async def get_venues_classes_for_day(self, venue_ids: List[str], day: str):
        """
        Get all classes for a list of venues on a given day.

        Args:
            venue_ids: List of venue IDs
            day: Day name (e.g., "Monday", "Tuesday")

        Returns:
            List of class documents for the given day and venue IDs
        """
        if not venue_ids:
            return []

        query = {
            "venueId": {"$in": venue_ids},
            "day": day,
        }
        cursor = self.classes_collection.find(query)
        return await cursor.to_list(length=None)
