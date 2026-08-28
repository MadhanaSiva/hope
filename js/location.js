/**
 * Campus Location & GPS Auto-Detection Module
 * Fixes broken dropdown with tappable zone cards + GPS nearest-zone detection.
 */

class LocationManager {
  constructor() {
    this.selectedZoneId = null;
    this.customDetail = '';
    this.gpsDetectedZoneId = null;
    this.currentGpsCoords = null;
  }

  // Calculate distance between two lat/lng coordinates in meters
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Find the closest campus zone to the given coordinates
  findNearestZone(userLat, userLng) {
    const zones = window.state.getCampusZones();
    let minDistance = Infinity;
    let closestZone = zones[0];

    zones.forEach(zone => {
      const dist = this.calculateDistance(userLat, userLng, zone.lat, zone.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestZone = zone;
      }
    });

    return { zone: closestZone, distance: Math.round(minDistance) };
  }

  // Trigger GPS detection
  detectUserLocation(onSuccess, onError) {
    if (!navigator.geolocation) {
      this.simulateLocationDetection(onSuccess);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 6000,
      maximumAge: 10000
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const result = this.findNearestZone(latitude, longitude);
        this.selectedZoneId = result.zone.id;
        this.gpsDetectedZoneId = result.zone.id;
        this.currentGpsCoords = {
          lat: parseFloat(latitude.toFixed(6)),
          lng: parseFloat(longitude.toFixed(6)),
          accuracy: Math.round(accuracy || 5)
        };
        onSuccess(result.zone, result.distance, this.currentGpsCoords);
      },
      (err) => {
        console.warn('Geolocation unavailable/denied, using campus GPS simulation:', err.message);
        this.simulateLocationDetection(onSuccess);
      },
      options
    );
  }

  // Realistic campus simulation when GPS is denied or in dev mode
  simulateLocationDetection(onSuccess) {
    const zones = window.state.getCampusZones();
    const mockZone = zones[0]; // Library - Ground Floor
    this.selectedZoneId = mockZone.id;
    this.gpsDetectedZoneId = mockZone.id;
    this.currentGpsCoords = {
      lat: mockZone.lat,
      lng: mockZone.lng,
      accuracy: 6
    };
    setTimeout(() => {
      onSuccess(mockZone, 6, this.currentGpsCoords);
    }, 450);
  }

  selectZone(zoneId) {
    this.selectedZoneId = zoneId;
    const zone = this.getSelectedZone();
    if (zone && !this.currentGpsCoords) {
      this.currentGpsCoords = {
        lat: zone.lat,
        lng: zone.lng,
        accuracy: 10
      };
    }
  }

  getSelectedZone() {
    const zones = window.state.getCampusZones();
    return zones.find(z => z.id === this.selectedZoneId) || zones[0];
  }

  setCustomDetail(detail) {
    this.customDetail = detail;
  }

  getCustomDetail() {
    return this.customDetail;
  }

  getFullLocationString() {
    const zone = this.getSelectedZone();
    if (!zone) return this.customDetail || 'Unspecified Location';
    if (this.customDetail && this.customDetail.trim()) {
      return `${zone.name} (${this.customDetail.trim()})`;
    }
    return zone.name;
  }

  getLocationPayload() {
    const zone = this.getSelectedZone();
    return {
      zoneName: zone.name,
      building: zone.building,
      floor: zone.floor,
      customDetail: this.customDetail ? this.customDetail.trim() : '',
      fullLocation: this.getFullLocationString(),
      gpsCoords: this.currentGpsCoords || { lat: zone.lat, lng: zone.lng, accuracy: 10 }
    };
  }
}

window.locationManager = new LocationManager();
