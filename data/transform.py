import json
import pandas as pd

# --- 1. Transform venues.json ---
def transform_venues(input_file, output_json, output_csv):
    with open(input_file, 'r') as f:
        venues_raw = json.load(f)

    transformed_venues = []
    for venue_id, info in venues_raw.items():
        # Restructure for MongoDB GeoJSON and unique _id
        venue_doc = {
            "_id": venue_id,
            "roomName": info.get("roomName"),
            "floor": info.get("floor"),
            "location": {
                "type": "Point",
                "coordinates": [
                    info.get("location", {}).get("x"), # Longitude
                    info.get("location", {}).get("y")  # Latitude
                ]
            }
        }
        transformed_venues.append(venue_doc)

    # Save as JSON (Best for MongoDB import)
    with open(output_json, 'w') as f:
        json.dump(transformed_venues, f, indent=2)

    # Save as CSV (Best for flat viewing)
    df_venues = pd.DataFrame([
        {
            "_id": v["_id"],
            "roomName": v["roomName"],
            "floor": v["floor"],
            "longitude": v["location"]["coordinates"][0],
            "latitude": v["location"]["coordinates"][1]
        } for v in transformed_venues
    ])
    df_venues.to_csv(output_csv, index=False)
    print(f"Transformed {len(transformed_venues)} venues.")

# --- 2. Transform nus_classes.json ---
def transform_classes(input_file, output_json, output_csv):
    with open(input_file, 'r') as f:
        classes_raw = json.load(f)

    transformed_classes = []
    for venue_id, days_list in classes_raw.items():
        for day_entry in days_list:
            day_name = day_entry.get('day')
            for class_item in day_entry.get('classes', []):
                # Flatten the structure: each class is its own document
                doc = class_item.copy()
                doc['venueId'] = venue_id
                doc['day'] = day_name
                transformed_classes.append(doc)

    # Save as JSON
    with open(output_json, 'w') as f:
        json.dump(transformed_classes, f, indent=2)

    # Save as CSV (convert 'weeks' list to string for CSV compatibility)
    df_classes = pd.DataFrame(transformed_classes)
    if 'weeks' in df_classes.columns:
        df_classes['weeks'] = df_classes['weeks'].apply(lambda x: json.dumps(x))
    df_classes.to_csv(output_csv, index=False)
    print(f"Transformed {len(transformed_classes)} class sessions.")

# Execute transformations
if __name__ == "__main__":
    transform_venues('venues.json', 'transformed_venues.json', 'transformed_venues.csv')
    transform_classes('nus_classes.json', 'transformed_classes.json', 'transformed_classes.csv')