import pandas as pd
import math

# Check hospital data
hdf = pd.read_csv(r'c:\Users\Vishv Patil\OneDrive\Desktop\FInal Project\Project Ui\india_hospital_large_dataset.csv')
print("=== HOSPITAL DATA ===")
print("Columns:", list(hdf.columns))
print("Shape:", hdf.shape)
print("lat range:", hdf['latitude'].min(), "to", hdf['latitude'].max())
print("lon range:", hdf['longitude'].min(), "to", hdf['longitude'].max())
print()
print("City counts (top 15):")
print(hdf['city'].value_counts().head(15))
print()

# Check for Vadodara
vad = hdf[hdf['city'].str.contains('Vadodara', case=False, na=False)]
print(f"Vadodara hospitals: {len(vad)}")
if len(vad) > 0:
    print(vad[['hospital_name','city','latitude','longitude']].head(5).to_string())
print()

# Check ambulance data
adf = pd.read_csv(r'c:\Users\Vishv Patil\OneDrive\Desktop\FInal Project\Project Ui\aegis_tactical\gps_ambulance_large_dataset.csv')
print("=== AMBULANCE DATA ===")
print("Columns:", list(adf.columns))
print("Shape:", adf.shape)
print("lat range:", adf['latitude'].min(), "to", adf['latitude'].max())
print("lon range:", adf['longitude'].min(), "to", adf['longitude'].max())
print()

# Haversine test: distance of closest hospital to Vadodara (22.31, 73.19)
VAD_LAT, VAD_LNG = 22.3072, 73.1812
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

hdf['dist_to_vad'] = hdf.apply(lambda r: haversine(VAD_LAT, VAD_LNG, r['latitude'], r['longitude']), axis=1)
closest_h = hdf.nsmallest(5, 'dist_to_vad')
print("5 closest hospitals to Vadodara:")
print(closest_h[['hospital_name','city','latitude','longitude','dist_to_vad']].to_string())
print()

adf_unique = adf.drop_duplicates(subset=['vehicle_id'], keep='first')
adf_unique = adf_unique.copy()
adf_unique['dist_to_vad'] = adf_unique.apply(lambda r: haversine(VAD_LAT, VAD_LNG, r['latitude'], r['longitude']), axis=1)
closest_a = adf_unique.nsmallest(5, 'dist_to_vad')
print("5 closest ambulances to Vadodara:")
print(closest_a[['vehicle_id','latitude','longitude','dist_to_vad']].to_string())
