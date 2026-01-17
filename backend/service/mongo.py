import os
from typing import Any, Dict, List, Optional
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, DuplicateKeyError, ServerSelectionTimeoutError
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

        try:
            self.client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=5000)
            self.client.admin.command('ping')
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            raise ConnectionError(f"Failed to connect to MongoDB at {self.mongo_uri}: {e}")

        self.db = self.client[self.db_name]

    def get_collection(self, collection_name: str):
        """Get a collection by name."""
        return self.db[collection_name]

    def close(self):
        self.client.close()