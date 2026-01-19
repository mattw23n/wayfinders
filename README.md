# Wayfinders

A smart pedestrian wayfinding application that calculates optimal walking routes while avoiding crowded areas based on real-time class schedules and venue occupancy.

## Features

- **Smart Route Calculation**: Generates multiple route options using OpenRouteService API
- **Crowd Avoidance**: Analyzes nearby venues and class schedules to calculate crowdedness penalties
- **AI-Powered Explanations**: Uses Anthropic AI to provide human-readable route recommendations
- **Interactive Map**: Built with Leaflet for smooth map interactions
- **Turn-by-turn Navigation**: Detailed step-by-step walking directions
- **Route Comparison**: Visual comparison of multiple routes with distance, duration, and crowdedness scores
- **Singapore-focused**: Search limited to Singapore locations for accurate local results

## Tech Stack

### Frontend
- **Framework**: Next.js 16 with React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Maps**: Leaflet with React Leaflet
- **UI Components**: Radix UI primitives
- **Icons**: Lucide React

### Backend
- **Framework**: FastAPI
- **Language**: Python 3
- **Database**: MongoDB
- **AI**: Anthropic Haiku (via LangChain)
- **Routing**: OpenRouteService API
- **HTTP Client**: httpx

## Prerequisites

- **Node.js** 20+ and npm/yarn
- **Python** 3.9+
- **MongoDB** (local or cloud instance)
- **OpenRouteService API Key** - [Get one here](https://openrouteservice.org/)
- **Anthropic Haiku API Key**

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/mattw23n/wayfinders.git
cd wayfinders
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env  # Or create manually
```

Configure your `.env` file in the `backend` directory:

```env
# MongoDB
MONGO_DATABASE_URL=mongodb://localhost:27017/
MONGO_DB_NAME=wayfinders

# OpenRouteService API
ORS_BASE_URL=https://api.openrouteservice.org
ORS_API_KEY=your_openrouteservice_api_key

# Anthropic AI
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 3. Frontend Setup

```bash
cd frontend/wayfinders

# Install dependencies
npm install
```

## Running the Application

### Start the Backend

```bash
cd backend
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uvicorn main:app --reload
```

The API will be available at `http://127.0.0.1:8000`

### Start the Frontend

```bash
cd frontend/wayfinders
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage

1. **Search for Start Location**: Use the first search bar to find your starting point
2. **Search for Destination**: Use the second search bar to set your destination
3. **Calculate Routes**: Click the "Calculate Route" button to generate route options
4. **View Routes**: The map will display up to 3 alternative routes:
   - **Green route**: Best option (least crowded)
   - **Blue route**: Alternative option
   - **Orange route**: Third alternative
5. **Compare Routes**: Swipe up the bottom panel to see detailed comparisons
6. **Switch Routes**: Tap different route tabs to view their turn-by-turn directions
7. **Follow Directions**: Use the step-by-step instructions to navigate

## API Endpoints

### POST `/routes/`

Calculate walking routes between two points with crowdedness analysis.

**Request Body:**
```json
{
  "start": {
    "longitude": 103.7766606,
    "latitude": 1.2959854
  },
  "end": {
    "longitude": 103.7723456,
    "latitude": 1.3050123
  }
}
```

**Response:**
```json
{
  "routes": [
    {
      "route": {
        "properties": {
          "summary": {
            "distance": 1528.6,
            "duration": 1100.5
          },
          "segments": [{
            "steps": [...]
          }]
        },
        "geometry": {
          "coordinates": [...]
        }
      },
      "nearby_venues": [...],
      "penalty_score": 0,
      "explanation": "Best choice: it's the least crowded path."
    }
  ]
}
```

## Project Structure

```
wayfinders/
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── models/                 # Pydantic models
│   │   ├── route.py
│   │   └── venue.py
│   ├── service/                # Service layer
│   │   └── mongo.py            # MongoDB client
│   ├── requirements.txt        # Python dependencies
│   └── .env                    # Environment variables
│
├── frontend/
│   └── wayfinders/
│       ├── app/                # Next.js app directory
│       ├── components/         # React components
│       │   └── ui/             # UI components (Map, Button, etc.)
│       ├── _components/        # Page-specific components
│       │   └── wayfinding-map.tsx
│       ├── package.json
│       └── tailwind.config.ts
│
├── data/                       # Data files
└── README.md
```

## How It Works

1. **Route Calculation**: When you request a route, the backend calls the OpenRouteService API to get up to 3 alternative walking routes
2. **Venue Analysis**: For each route, the system checks for nearby venues (within 50m) along the path using MongoDB geospatial queries
3. **Crowdedness Scoring**: The system calculates a penalty score based on:
   - Class schedules at nearby venues
   - Whether classes are starting/ending within 15 minutes
   - Class size and proximity to the route
4. **AI Explanations**: Anthropic Haiku generates friendly, human-readable explanations for each route
5. **Route Ranking**: Routes are sorted by penalty score (lower is better)
6. **Visualization**: The frontend displays all routes on an interactive map with color-coding

## Database Schema

### Venues Collection
```javascript
{
  "_id": "venue-id",
  "name": "Venue Name",
  "location": {
    "type": "Point",
    "coordinates": [longitude, latitude]  // GeoJSON format
  }
}
```

### Classes Collection
```javascript
{
  "_id": "class-id",
  "venue_id": "venue-id",
  "day": "Monday",
  "startTime": "0900",  // HHMM format
  "endTime": "1100",
  "size": 50
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Acknowledgments

- [OpenRouteService](https://openrouteservice.org/) for routing API
- [Photon](https://photon.komoot.io/) for geocoding
- [Leaflet](https://leafletjs.com/) for mapping

## Devpost Link
Check out wayfinders on [Devpost](https://devpost.com/software/wayfinders)