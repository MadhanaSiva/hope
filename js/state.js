/**
 * CampusGuard State Management & Real-Time Synchronizer
 * Synchronizes multi-tab and multi-device events via Server-Sent Events (SSE), BroadcastChannel & LocalStorage
 */

const STORAGE_KEYS = {
  CURRENT_USER: 'campusguard_user',
  INCIDENTS: 'campusguard_incidents',
  SENSORS: 'campusguard_sensors',
  DIRECTORY: 'campusguard_directory',
  SETTINGS: 'campusguard_settings',
  AUDIT_LOGS: 'campusguard_audit_logs',
  BROADCAST: 'campusguard_broadcast'
};

// Strict 1-to-1 Category to Department Routing Configuration
const DEPARTMENT_ROUTING = {
  'Fire Warden': ['fire'],
  'Medical': ['medical'],
  'Safety Cell': ['harassment'],
  'Accident Response': ['accident'],
  'Security': ['general']
};

// Production Department & Role Accounts
const DEFAULT_USERS = [
  {
    id: 'user-student-1',
    email: 'student@campusguard.edu',
    aliases: ['student@campusguard.edu', 'kavitha@campusguard.edu', 'student', 'kavitha@demo.com'],
    password: 'guard2026',
    name: 'Kavitha Ramanathan',
    role: 'student', // Reporter
    department: 'Computer Science',
    phone: '+91 98450 11223',
    studentId: 'STU-2024-001'
  },
  {
    id: 'user-responder-fire',
    email: 'fire.warden@campusguard.edu',
    aliases: ['fire.warden@campusguard.edu', 'fire@campusguard.edu', 'fire', 'fire@demo.com'],
    password: 'guard2026',
    name: 'Warden M. Jagadeesan',
    role: 'responder',
    responderType: 'Fire Warden',
    department: 'Fire & Safety Warden Unit',
    phone: '+91 98450 88990'
  },
  {
    id: 'user-responder-med',
    email: 'medical.bay@campusguard.edu',
    aliases: ['medical.bay@campusguard.edu', 'medical@campusguard.edu', 'medical', 'medical@demo.com'],
    password: 'guard2026',
    name: 'Dr. Priya Nair',
    role: 'responder',
    responderType: 'Medical',
    department: 'Campus Medical Bay',
    phone: '+91 98450 77889'
  },
  {
    id: 'user-responder-safety',
    email: 'safety.cell@campusguard.edu',
    aliases: ['safety.cell@campusguard.edu', 'safety@campusguard.edu', 'safety', 'safety@demo.com'],
    password: 'guard2026',
    name: 'Prof. S. Meenakshi',
    role: 'responder',
    responderType: 'Safety Cell',
    department: "Women's Safety & Counseling Cell",
    phone: '+91 98450 55443'
  },
  {
    id: 'user-responder-acc',
    email: 'accident.patrol@campusguard.edu',
    aliases: ['accident.patrol@campusguard.edu', 'accident@campusguard.edu', 'accident', 'accident@demo.com'],
    password: 'guard2026',
    name: 'Officer Vikram Singh',
    role: 'responder',
    responderType: 'Accident Response',
    department: 'Emergency Trauma & Road Patrol',
    phone: '+91 98450 33221'
  },
  {
    id: 'user-responder-sec',
    email: 'security.desk@campusguard.edu',
    aliases: ['security.desk@campusguard.edu', 'security@campusguard.edu', 'security', 'security@demo.com'],
    password: 'guard2026',
    name: 'Officer Rajesh Sharma',
    role: 'responder',
    responderType: 'Security',
    department: 'Campus Security & Control Desk',
    phone: '+91 98450 66778'
  },
  {
    id: 'user-admin-1',
    email: 'admin@campusguard.edu',
    aliases: ['admin@campusguard.edu', 'admin', 'admin@demo.com'],
    password: 'guard2026',
    name: 'Dean Dr. V. Sundaram',
    role: 'admin',
    department: 'Chief Campus Administrator',
    phone: '+91 98450 99001'
  }
];

const DEFAULT_SENSORS = [
  { id: 'FIRE-101', type: 'Fire/Smoke', zone: 'Library - Ground Floor', status: 'Active', lastTested: '2026-08-20' },
  { id: 'FIRE-102', type: 'Fire/Smoke', zone: 'Hostel Block A - 2nd Floor', status: 'Active', lastTested: '2026-08-22' },
  { id: 'FIRE-103', type: 'Fire/Smoke', zone: 'Main Canteen', status: 'Active', lastTested: '2026-08-24' },
  { id: 'FIRE-104', type: 'Fire/Smoke', zone: 'Computer Lab 3', status: 'Active', lastTested: '2026-08-25' },
  { id: 'FIRE-105', type: 'Fire/Smoke', zone: 'Auditorium', status: 'Active', lastTested: '2026-08-26' },
  { id: 'MED-201', type: 'Medical', zone: 'Sick Room', status: 'Active', lastTested: '2026-08-27' },
  { id: 'MED-202', type: 'Medical', zone: 'Hostel Block B', status: 'Active', lastTested: '2026-08-28' }
];

const DEFAULT_CAMPUS_ZONES = [
  { id: 'z1', name: 'Library - Ground Floor', building: 'Academic Block A', lat: 12.9716, lng: 77.5946, floor: 'Ground Floor', icon: '📚' },
  { id: 'z2', name: 'Hostel Block A - 2nd Floor', building: 'Hostel Block A', lat: 12.9722, lng: 77.5952, floor: '2nd Floor', icon: '🏢' },
  { id: 'z3', name: 'Hostel Block B', building: 'Hostel Block B', lat: 12.9725, lng: 77.5958, floor: '1st Floor', icon: '🏢' },
  { id: 'z4', name: 'Main Canteen', building: 'Dining Complex', lat: 12.9710, lng: 77.5940, floor: 'Ground Floor', icon: '☕' },
  { id: 'z5', name: 'Computer Lab 3', building: 'Tech Hub', lat: 12.9719, lng: 77.5938, floor: '3rd Floor', icon: '💻' },
  { id: 'z6', name: 'Auditorium', building: 'Convention Center', lat: 12.9708, lng: 77.5950, floor: 'Main Hall', icon: '🎭' },
  { id: 'z7', name: 'Sick Room', building: 'Health Center', lat: 12.9714, lng: 77.5935, floor: 'Ground Floor', icon: '🏥' },
  { id: 'z8', name: 'Science Block - 1st Floor', building: 'Research Center', lat: 12.9730, lng: 77.5942, floor: '1st Floor', icon: '🔬' },
  { id: 'z9', name: 'Sports Complex', building: 'Athletics Ground', lat: 12.9702, lng: 77.5960, floor: 'Ground Area', icon: '⚽' },
  { id: 'z10', name: 'Main Administrative Building', building: 'Admin Block', lat: 12.9712, lng: 77.5948, floor: 'Level 1', icon: '🏛️' }
];

const DEFAULT_DIRECTORY = [
  { id: 'STU-2024-001', name: 'Kavitha Ramanathan', role: 'Student', department: 'Computer Science', phone: '+91 98450 11223' },
  { id: 'STU-2024-042', name: 'Rahul Verma', role: 'Student', department: 'Mechanical Engineering', phone: '+91 98450 22334' },
  { id: 'STU-2024-089', name: 'Ananya Krishnan', role: 'Student', department: 'Electronics & Comm', phone: '+91 98450 33445' },
  { id: 'STU-2025-015', name: 'Rohan Sen', role: 'Student', department: 'Biotechnology', phone: '+91 98450 44556' },
  { id: 'FAC-2021-012', name: 'Dr. Sarah Paul', role: 'Faculty', department: 'Computer Science', phone: '+91 98450 55667' },
  { id: 'WRD-2018-009', name: 'Warden M. Jagadeesan', role: 'Responder (Fire)', department: 'Fire & Safety Warden', phone: '+91 98450 88990' },
  { id: 'MED-2020-002', name: 'Dr. Priya Nair', role: 'Responder (Medical)', department: 'Campus Medical Bay', phone: '+91 98450 77889' },
  { id: 'SAF-2019-011', name: 'Prof. S. Meenakshi', role: 'Responder (Safety)', department: "Women's Safety Cell", phone: '+91 98450 55443' },
  { id: 'ACC-2022-004', name: 'Officer Vikram Singh', role: 'Responder (Accident)', department: 'Emergency Trauma Patrol', phone: '+91 98450 33221' },
  { id: 'SEC-2019-005', name: 'Officer Rajesh Sharma', role: 'Responder (Security)', department: 'Campus Security', phone: '+91 98450 66778' },
  { id: 'ADM-2015-001', name: 'Dean Dr. V. Sundaram', role: 'Admin', department: 'Administration', phone: '+91 98450 99001' }
];

class AppState {
  constructor() {
    this.broadcastChannel = null;
    this.subscribers = [];
    this.initBroadcast();
    this.initStorage();
    this.initServerSync();
  }

  initBroadcast() {
    try {
      if ('BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel('campusguard_sync_channel');
        this.broadcastChannel.onmessage = (event) => {
          this.notifySubscribers(event.data);
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel not supported, falling back to storage events', e);
    }

    // Storage event for fallback cross-tab sync
    window.addEventListener('storage', (e) => {
      if (Object.values(STORAGE_KEYS).includes(e.key)) {
        this.notifySubscribers({ type: 'STORAGE_SYNC', key: e.key });
      }
    });
  }

  initStorage() {
    if (!localStorage.getItem(STORAGE_KEYS.SENSORS)) {
      localStorage.setItem(STORAGE_KEYS.SENSORS, JSON.stringify(DEFAULT_SENSORS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.DIRECTORY)) {
      localStorage.setItem(STORAGE_KEYS.DIRECTORY, JSON.stringify(DEFAULT_DIRECTORY));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ soundEnabled: true }));
    }
    if (!localStorage.getItem(STORAGE_KEYS.INCIDENTS)) {
      localStorage.setItem(STORAGE_KEYS.INCIDENTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)) {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify([
        { id: 'log-1', timestamp: new Date().toISOString(), message: '🛡️ CampusGuard Core System Initialized. All terminals online.' }
      ]));
    }
  }

  // Real-Time Cross-Device Synchronization via Dual-Engine (SSE + 1000ms Fast Sync Polling)
  initServerSync() {
    // 1. Initial immediate pull of server state on page load
    this.pollServerIncidents();

    // 2. Real-Time Server-Sent Events (SSE) Stream
    try {
      if ('EventSource' in window) {
        const eventSource = new EventSource('/api/events');
        
        eventSource.onmessage = (e) => {
          try {
            const event = JSON.parse(e.data);
            
            if (event.type === 'INCIDENT_CREATED') {
              const incidents = this.getIncidents();
              const existingIdx = incidents.findIndex(i => i.id === event.data.id);
              if (existingIdx === -1) {
                incidents.unshift(event.data);
              } else {
                incidents[existingIdx] = event.data;
              }
              localStorage.setItem(STORAGE_KEYS.INCIDENTS, JSON.stringify(incidents));
              this.notifySubscribers({ type: 'INCIDENTS_UPDATED', incidents });
            } else if (event.type === 'INCIDENT_UPDATED') {
              const incidents = this.getIncidents();
              const idx = incidents.findIndex(i => i.id === event.data.id);
              if (idx !== -1) {
                incidents[idx] = event.data;
              } else {
                incidents.unshift(event.data);
              }
              localStorage.setItem(STORAGE_KEYS.INCIDENTS, JSON.stringify(incidents));
              this.notifySubscribers({ type: 'INCIDENTS_UPDATED', incidents });
            } else if (event.type === 'SYNC_STATE') {
              if (event.data && event.data.incidents && Array.isArray(event.data.incidents)) {
                const currentList = this.getIncidents();
                if (event.data.incidents.length > 0 || currentList.length === 0) {
                  localStorage.setItem(STORAGE_KEYS.INCIDENTS, JSON.stringify(event.data.incidents));
                  this.notifySubscribers({ type: 'INCIDENTS_UPDATED', incidents: event.data.incidents });
                }
              }
            }
          } catch (err) {
            console.warn('Error parsing SSE message:', err);
          }
        };

        eventSource.onerror = () => {
          // SSE reconnecting in background
        };
      }
    } catch (e) {
      console.warn('Server SSE sync unavailable:', e);
    }

    // 3. Fallback High-Speed 1000ms REST Polling (Guarantees sync even across strict Wi-Fi firewalls)
    setInterval(() => {
      this.pollServerIncidents();
    }, 1000);
  }

  async pollServerIncidents() {
    try {
      const res = await fetch('/api/incidents');
      if (res.ok) {
        const serverList = await res.json();
        if (Array.isArray(serverList)) {
          const currentList = this.getIncidents();
          const currKey = currentList.map(i => `${i.id}:${i.status}:${i.pulseAttempt}`).join('|');
          const servKey = serverList.map(i => `${i.id}:${i.status}:${i.pulseAttempt}`).join('|');
          if (currKey !== servKey) {
            localStorage.setItem(STORAGE_KEYS.INCIDENTS, JSON.stringify(serverList));
            this.notifySubscribers({ type: 'INCIDENTS_UPDATED', incidents: serverList });
          }
        }
      }
    } catch (e) {
      // Offline fallback
    }
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  notifySubscribers(event) {
    this.subscribers.forEach(cb => {
      try { cb(event); } catch (err) { console.error('State subscriber error:', err); }
    });
  }

  emit(type, payload = {}) {
    const event = { type, payload, timestamp: Date.now() };
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(event);
    }
    localStorage.setItem(STORAGE_KEYS.BROADCAST, JSON.stringify(event));
    this.notifySubscribers(event);
  }

  // Getters & Setters
  getCurrentUser() {
    const userStr = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    return userStr ? JSON.parse(userStr) : null;
  }

  setCurrentUser(user) {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
    this.emit('AUTH_STATE_CHANGED', { user });
  }

  getIncidents() {
    const data = localStorage.getItem(STORAGE_KEYS.INCIDENTS);
    return data ? JSON.parse(data) : [];
  }

  saveIncidents(incidents) {
    localStorage.setItem(STORAGE_KEYS.INCIDENTS, JSON.stringify(incidents));
    this.emit('INCIDENTS_UPDATED', { incidents });
  }

  getSensors() {
    const data = localStorage.getItem(STORAGE_KEYS.SENSORS);
    return data ? JSON.parse(data) : DEFAULT_SENSORS;
  }

  saveSensors(sensors) {
    localStorage.setItem(STORAGE_KEYS.SENSORS, JSON.stringify(sensors));
    this.emit('SENSORS_UPDATED', { sensors });
  }

  getDirectory() {
    const data = localStorage.getItem(STORAGE_KEYS.DIRECTORY);
    return data ? JSON.parse(data) : DEFAULT_DIRECTORY;
  }

  saveDirectory(directory) {
    localStorage.setItem(STORAGE_KEYS.DIRECTORY, JSON.stringify(directory));
    this.emit('DIRECTORY_UPDATED', { directory });
  }

  getSettings() {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : { soundEnabled: true };
  }

  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    this.emit('SETTINGS_UPDATED', { settings });
  }

  getAuditLogs() {
    const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    return data ? JSON.parse(data) : [];
  }

  addAuditLog(message) {
    const logs = this.getAuditLogs();
    logs.unshift({
      id: 'log-' + Date.now(),
      timestamp: new Date().toISOString(),
      message
    });
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs.slice(0, 100)));
    this.emit('AUDIT_LOGS_UPDATED');
  }

  getCampusZones() {
    return DEFAULT_CAMPUS_ZONES;
  }

  getDepartmentRouting() {
    return DEPARTMENT_ROUTING;
  }
}

window.DEFAULT_USERS = DEFAULT_USERS;
window.state = new AppState();
