# CampusGuard — Smart Campus Emergency Response & Safety Management System

An intelligent, real-time emergency reporting and dispatch system built for campuses — colleges, hospitals, and offices — that routes emergencies to the right responder instantly, in the right language, with zero hardware cost.

## Overview

CampusGuard lets anyone on campus report an emergency — Fire, Medical, Harassment, Accident, or General — through a simple app. Reports are instantly routed to the correct department (Security, Medical, Warden, or Admin), with live status tracking, automatic escalation if unacknowledged, and multilingual voice support.

Unlike traditional fire alarms or generic SOS buttons, CampusGuard tells responders **exactly what happened and where**, in a language they understand, and keeps every report accountable and logged.

## Key Features

- **Smart Category Routing** — 5 emergency types, each routed to the correct department (not one generic alert to everyone)
- **Real-Time Multi-Device Sync** — powered by Server-Sent Events (SSE), so every connected device sees updates live, instantly
- **Escalation on No Response** — unacknowledged alerts automatically escalate after repeated attempts, ensuring nothing is missed
- **Selective Public Broadcast** — Fire/Hazard alerts warn everyone nearby; sensitive reports (Harassment, Medical) stay private to protect the reporter
- **Multilingual Support** — English, Tamil, and Hindi, independently selectable for both reporters and responders
- **Sensor-Ready Architecture** — a Sensor Registry maps device IDs to campus zones, so real IoT smoke/fire sensors can be integrated without changing the core logic
- **Accountability & Anti-Misuse** — login required for all reports, with full audit history and false-alarm tracking
- **Admin Configurable** — zones, responder contacts, and sensor mappings can be set up for any campus, not hardcoded to one building

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (Vanilla JS)
- **Backend:** Node.js
- **Real-Time Communication:** Server-Sent Events (SSE)
- **Data Storage:** In-memory storage for this prototype (structured for a straightforward upgrade to a persistent database such as MongoDB or PostgreSQL in production)

## Project Structure

```
├── index.html          # Main app structure
├── server.js            # Node.js backend server + SSE broadcasting
├── css/
│   ├── main.css          # Global layout
│   ├── components.css     # Reusable UI components
│   └── views.css          # Page-specific styles
└── js/
    ├── app.js            # Core application logic
    ├── auth.js            # Login & role management
    ├── alerts.js           # Emergency report creation & handling
    ├── sensors.js          # Sensor ID → zone registry
    ├── location.js         # Zone/location handling
    ├── directory.js         # Contact directory
    ├── audio.js            # Voice alerts
    └── state.js            # Real-time state synchronization
```

## Getting Started

**Requirements:** Node.js v18 or higher

```bash
git clone <this-repository-url>
cd campusguard
npm start
```

Open the app in your browser at the address shown in the terminal. Any device on the same network can connect and stay synchronized in real time.

## Known Limitations (Prototype Scope)

- **In-memory data:** Data resets if the server restarts. A production version would connect to a persistent database.
- **No background push notifications:** Alerts currently work while the app is open. Full background notifications (like WhatsApp) would require a Service Worker with a push service such as Firebase Cloud Messaging.
- **Simulated sensor input:** Since real hardware wasn't available, sensor triggers are simulated through the app. The architecture is built so real IoT sensors can be connected without changing the core logic.

## Team

Team Name: TheThinkers
Event: [Hackathon Name / SNS College 24-Hour Hackathon]

## License

MIT
