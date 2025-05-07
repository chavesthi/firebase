
import { GOOGLE_MAPS_API_KEY } from '@/lib/constants';

/**
 * Represents a geographical location with latitude and longitude coordinates.
 */
export interface Location {
  /**
   * The latitude of the location.
   */
  lat: number;
  /**
   * The longitude of the location.
   */
  lng: number;
}

/**
 * Asynchronously converts an address string to geographic coordinates (latitude and longitude).
 *
 * @param address The address to geocode.
 * @returns A promise that resolves to a Location object containing the latitude and longitude of the address.
 * @throws An error if geocoding fails or no results are found.
 */
export async function geocodeAddress(address: string): Promise<Location> {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "YOUR_DEFAULT_API_KEY_HERE") {
    console.error("Google Maps API Key is not configured correctly for geocoding.");
    throw new Error("Geocoding service is not available due to missing API key.");
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
      };
    } else if (data.status === 'ZERO_RESULTS') {
      throw new Error(`No results found for the address: "${address}".`);
    } else {
      console.error('Geocoding API error:', data.status, data.error_message);
      throw new Error(`Geocoding failed: ${data.status} - ${data.error_message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error during geocoding fetch:', error);
    if (error instanceof Error) {
        throw new Error(`Failed to geocode address: ${error.message}`);
    }
    throw new Error('Failed to geocode address due to an unknown error.');
  }
}

