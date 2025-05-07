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
 */
export async function geocodeAddress(address: string): Promise<Location> {
  // TODO: Implement this by calling an API.
  return {
    lat: -23.5505,
    lng: -46.6333,
  };
}
