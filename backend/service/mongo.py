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

    async def ensure_geospatial_index(self, collection_name: str):
        """Create 2dsphere geospatial index on location.coordinates if it doesn't exist."""
        try:
            collection = self.db[collection_name]
            # Create 2dsphere index
            await collection.create_index([("location.coordinates", "2dsphere")])
        except Exception as e:
            print(f"Warning: Could not create geospatial index on {collection_name}: {e}")

    async def find_venues_near_coordinates(self, collection_name: str, coordinates: List[List[float]], max_distance_meters: int) -> List[Dict[str, Any]]:
        """
        Find all unique venues within max_distance_meters from any of the given coordinates.
        Uses chunked $geoNear queries to avoid N+1 problem while respecting MongoDB limitations.
        Reduces 500+ queries down to ~5-10 strategic queries.

        Args:
            collection_name: Collection to query
            coordinates: List of [longitude, latitude] coordinate pairs
            max_distance_meters: Maximum distance in meters

        Returns:
            List of unique venues with their closest distance to any coordinate
        """
        if not coordinates:
            return []

        # Chunk strategy: query at start, middle, and end, plus every 100 coordinates
        chunk_size = 10
        representative_indices = [0]  # Always start

        if len(coordinates) > 1:
            representative_indices.append(len(coordinates) - 1)  # Always end

        # Add middle points
        if len(coordinates) > chunk_size:
            for i in range(chunk_size, len(coordinates), chunk_size):
                representative_indices.append(i)

        # Remove duplicates and sort
        representative_indices = sorted(set(representative_indices))

        # Collect results from all queries
        seen_venues = {}  # venue_id -> {venue data + minimum distance}

        collection = self.db[collection_name]

        # Run $geoNear query for each representative coordinate
        for idx in representative_indices:
            coord = coordinates[idx]
            pipeline = [
                {
                    "$geoNear": {
                        "near": {"type": "Point", "coordinates": coord},
                        "distanceField": "distance",
                        "maxDistance": max_distance_meters,
                        "spherical": True
                    }
                }
            ]

            cursor = collection.aggregate(pipeline)
            results = await cursor.to_list(length=None)

            # Merge results, keeping minimum distance for each venue
            for venue in results:
                venue_id = str(venue.get("_id"))
                distance = venue.get("distance", max_distance_meters)

                if venue_id not in seen_venues or distance < seen_venues[venue_id]["distance"]:
                    venue["_id"] = venue_id
                    seen_venues[venue_id] = venue

        # Convert to list and sort by distance
        result_list = list(seen_venues.values())
        result_list.sort(key=lambda x: x.get("distance", max_distance_meters))

        return result_list

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
