/**
 * Sensor Registry Management & Live Sensor Trigger Simulator
 */

class SensorManager {
  constructor() {
    this.init();
  }

  init() {
    // Ensure state sensors are synced
  }

  getAllSensors() {
    return window.state.getSensors();
  }

  getSensorById(id) {
    const sensors = this.getAllSensors();
    return sensors.find(s => s.id === id) || null;
  }

  addSensor(sensorData) {
    const sensors = this.getAllSensors();
    // Validate uniqueness
    if (sensors.some(s => s.id.toLowerCase() === sensorData.id.toLowerCase())) {
      throw new Error(`Sensor with ID ${sensorData.id} already exists.`);
    }

    const newSensor = {
      id: sensorData.id.toUpperCase().trim(),
      type: sensorData.type || 'Fire/Smoke',
      zone: sensorData.zone || 'Library - Ground Floor',
      status: sensorData.status || 'Active',
      lastTested: new Date().toISOString().split('T')[0]
    };

    sensors.unshift(newSensor);
    window.state.saveSensors(sensors);
    window.state.addAuditLog(`Sensor ${newSensor.id} (${newSensor.type}) added to ${newSensor.zone} by Admin.`);
    return newSensor;
  }

  updateSensor(id, updateData) {
    const sensors = this.getAllSensors();
    const index = sensors.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Sensor not found');

    sensors[index] = {
      ...sensors[index],
      ...updateData,
      id: sensors[index].id // preserve ID
    };

    window.state.saveSensors(sensors);
    window.state.addAuditLog(`Sensor ${id} updated.`);
    return sensors[index];
  }

  deleteSensor(id) {
    let sensors = this.getAllSensors();
    const sensor = sensors.find(s => s.id === id);
    if (!sensor) return false;

    sensors = sensors.filter(s => s.id !== id);
    window.state.saveSensors(sensors);
    window.state.addAuditLog(`Sensor ${id} removed from registry.`);
    return true;
  }

  /**
   * Simulate Sensor Trigger
   * Triggering a sensor generates a live emergency alert with pre-filled zone and category.
   * NO SOUND played from the trigger action itself.
   */
  triggerSensorSimulation(sensorId) {
    const sensor = this.getSensorById(sensorId);
    if (!sensor) throw new Error('Sensor not found');

    let category = 'fire';
    if (sensor.type.toLowerCase().includes('medical')) {
      category = 'medical';
    } else if (sensor.type.toLowerCase().includes('hazard')) {
      category = 'hazard';
    }

    // Match zone data for rich GPS & location representation
    const zones = window.state.getCampusZones();
    const matchedZone = zones.find(z => z.name.toLowerCase() === sensor.zone.toLowerCase()) || zones[0];

    const triggerAlert = {
      id: 'INC-' + Math.floor(1000 + Math.random() * 9000),
      category: category,
      categoryLabel: sensor.type === 'Medical' ? 'Medical Emergency' : 'Fire / Smoke Hazard',
      location: sensor.zone,
      zoneName: matchedZone.name,
      building: matchedZone.building,
      floor: matchedZone.floor,
      customDetail: `Automated Sensor Node ${sensor.id}`,
      gpsCoords: { lat: matchedZone.lat, lng: matchedZone.lng, accuracy: 5 },
      description: `[AUTOMATED IOT SENSOR TRIGGER] Rapid telemetry anomaly detected by hardware sensor ${sensor.id} (${sensor.type}) located at ${sensor.zone}. Immediate verification requested.`,
      reportedBy: {
        id: 'system-sensor-' + sensor.id,
        name: `Automated Sensor ${sensor.id}`,
        role: 'IoT Sensor Node',
        phone: 'Automated Hardware Telemetry'
      },
      status: 'Reported',
      createdAt: new Date().toISOString(),
      pulseAttempt: 1,
      lastPulseTime: Date.now(),
      escalated: false,
      escalatedTo: null,
      sensorId: sensor.id,
      timeline: [
        {
          status: 'Reported',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          note: `IoT Sensor ${sensor.id} triggered threshold breach at ${sensor.zone}. Pulse 1 dispatched to on-duty responders.`
        }
      ]
    };

    // Save and broadcast
    const incidents = window.state.getIncidents();
    incidents.unshift(triggerAlert);
    window.state.saveIncidents(incidents);
    window.state.addAuditLog(`🚨 SENSOR TRIGGER: ${sensor.id} in ${sensor.zone} created incident ${triggerAlert.id}`);

    // NOTE: Sound removed as per Requirement 1. Sound only plays on incoming responder notification.
    return triggerAlert;
  }
}

window.sensorManager = new SensorManager();
