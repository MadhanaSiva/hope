/**
 * Emergency Alerts, Category Auto-Responses, and 3-Attempt Escalation Engine
 */

const CATEGORY_DEFINITIONS = {
  fire: {
    id: 'fire',
    label: 'Fire / Smoke Hazard',
    icon: '🔥',
    autoResponse: 'Stay calm. Move to nearest exit. Do not use elevator. Fire Warden notified.',
    theme: 'fire',
    hotlines: [
      { name: 'Fire Warden Hotline', number: 'Ext. 101' },
      { name: 'Campus Safety Command', number: '+91 98450 66778' }
    ]
  },
  medical: {
    id: 'medical',
    label: 'Medical Emergency',
    icon: '🩺',
    autoResponse: 'Help is on the way. Stay with the person if safe. Do not move them unless necessary.',
    theme: 'medical',
    hotlines: [
      { name: 'Campus Medical Bay', number: 'Ext. 104' },
      { name: 'Emergency Ambulance', number: '108' }
    ]
  },
  harassment: {
    id: 'harassment',
    label: 'Harassment / Safety Threat',
    icon: '🛡️',
    autoResponse: 'Your report is private, only Security and Admin can see it. Move to a safe, populated area if possible.',
    theme: 'harassment',
    hotlines: [
      { name: 'Women Safety Cell', number: 'Ext. 105' },
      { name: 'Chief Security Officer', number: '+91 98450 66778' }
    ]
  },
  accident: {
    id: 'accident',
    label: 'Accident / Collision',
    icon: '⚠️',
    autoResponse: 'Security and Medical notified. Keep the area clear for responders.',
    theme: 'accident',
    hotlines: [
      { name: 'Security Patrol', number: 'Ext. 100' },
      { name: 'Campus First Aid', number: 'Ext. 104' }
    ]
  },
  general: {
    id: 'general',
    label: 'Other / General Emergency',
    icon: 'ℹ️',
    autoResponse: "Your report has been sent to Admin. You'll be updated here.",
    theme: 'general',
    hotlines: [
      { name: 'Dean Office Helpline', number: 'Ext. 103' },
      { name: 'Campus Control Desk', number: '+91 98450 99001' }
    ]
  }
};

class AlertManager {
  constructor() {
    this.pulseInterval = 30; // 30 seconds per attempt
    this.timerId = null;
    this.startEscalationHeartbeat();
  }

  getCategoryInfo(categoryId) {
    return CATEGORY_DEFINITIONS[categoryId] || CATEGORY_DEFINITIONS.general;
  }

  // Create and broadcast an emergency report from student/staff
  createReport({ category, locationPayload, details, reporter, voiceNote = null, photoUrl = null }) {
    const catInfo = this.getCategoryInfo(category);
    const incidentId = 'INC-' + Math.floor(1000 + Math.random() * 9000);

    const newIncident = {
      id: incidentId,
      category: category,
      categoryLabel: catInfo.label,
      location: locationPayload.fullLocation || 'Campus - Unspecified Location',
      zoneName: locationPayload.zoneName || 'Campus Zone',
      building: locationPayload.building || 'Campus Facility',
      floor: locationPayload.floor || 'Level 1',
      customDetail: locationPayload.customDetail || '',
      gpsCoords: locationPayload.gpsCoords || null,
      description: details || `Emergency reported: ${catInfo.label} at ${locationPayload.fullLocation}`,
      voiceNote: voiceNote,
      photoUrl: photoUrl,
      reportedBy: {
        id: reporter.id,
        name: reporter.name,
        role: reporter.role,
        department: reporter.department || 'Student',
        phone: reporter.phone || 'N/A'
      },
      status: 'Reported',
      createdAt: new Date().toISOString(),
      pulseAttempt: 1,
      lastPulseTime: Date.now(),
      escalated: false,
      escalatedTo: null,
      autoResponseText: catInfo.autoResponse,
      timeline: [
        {
          status: 'Reported',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          note: `Emergency reported by ${reporter.name}.${voiceNote ? ' [Voice Note Attached]' : ''}${photoUrl ? ' [Photo Evidence Attached]' : ''} Attempt 1 notification pulsed to On-Duty Responders.`
        }
      ]
    };

    const incidents = window.state.getIncidents();
    incidents.unshift(newIncident);
    window.state.saveIncidents(incidents);
    window.state.addAuditLog(`🚨 Alert Created: ${newIncident.id} (${catInfo.label}) at ${newIncident.location} by ${reporter.name}`);

    // Broadcast to Server for Multi-Device LAN Synchronization
    try {
      fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newIncident)
      }).catch(e => console.warn('Server sync offline:', e.message));
    } catch (e) {
      console.warn('Network sync error:', e);
    }

    return newIncident;
  }

  // Heartbeat escalation loop: auto-resends on 30s intervals (Attempt 1 -> Attempt 2 -> Attempt 3 -> Auto Escalation to Admin + Backup)
  startEscalationHeartbeat() {
    if (this.timerId) clearInterval(this.timerId);

    this.timerId = setInterval(() => {
      this.checkEscalationStatuses();
    }, 1000);
  }

  checkEscalationStatuses() {
    const incidents = window.state.getIncidents();
    let hasChanges = false;
    const now = Date.now();
    const currentUser = window.state.getCurrentUser();

    incidents.forEach(inc => {
      // Only unacknowledged 'Reported' incidents escalate
      if (inc.status === 'Reported') {
        const elapsedSec = Math.floor((now - inc.lastPulseTime) / 1000);

        // Transition from Attempt 1 -> Attempt 2 (after 30 seconds)
        if (inc.pulseAttempt === 1 && elapsedSec >= this.pulseInterval) {
          inc.pulseAttempt = 2;
          inc.lastPulseTime = now;
          inc.timeline.unshift({
            status: 'Attempt 2 Pulse',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            note: 'No responder acknowledgment received after 30s. Attempt 2 pulse re-sent to on-duty responders.'
          });

          // Play sound ONLY if current user is a Responder routed to this category
          if (this.shouldPlayResponderAlert(currentUser, inc.category)) {
            window.soundEngine.playPulseSound();
          }

          window.state.addAuditLog(`⏰ [Pulse 2] Alert ${inc.id} unacknowledged. Re-pulsing to responders.`);
          hasChanges = true;
        }
        // Transition from Attempt 2 -> Attempt 3 (after another 30 seconds)
        else if (inc.pulseAttempt === 2 && elapsedSec >= this.pulseInterval) {
          inc.pulseAttempt = 3;
          inc.lastPulseTime = now;
          inc.timeline.unshift({
            status: 'Attempt 3 Urgent Pulse',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            note: 'FINAL ATTEMPT: No acknowledgment after 60s. Urgent pulse sent to responder terminals.'
          });

          // Play sound ONLY if current user is a Responder routed to this category
          if (this.shouldPlayResponderAlert(currentUser, inc.category)) {
            window.soundEngine.playEscalationAlarm();
          }

          window.state.addAuditLog(`⚠️ [Pulse 3 FINAL] Alert ${inc.id} approaching critical escalation deadline.`);
          hasChanges = true;
        }
        // Attempt 3 expired unacknowledged -> AUTO ESCALATE TO ADMIN + BACKUP RESPONDER
        else if (inc.pulseAttempt === 3 && elapsedSec >= this.pulseInterval && !inc.escalated) {
          inc.escalated = true;
          inc.status = 'Escalated';
          inc.escalatedTo = 'Admin & Designated Backup Responder (Chief Security Officer)';
          inc.timeline.unshift({
            status: 'Escalated to Admin & Backup',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            note: 'CRITICAL FAILOVER: Attempt 3 expired unacknowledged. Automatically escalated alert to Admin Command & Backup Chief Officer.'
          });

          // Play sound for Admin or Responder during critical escalation
          if (currentUser && (currentUser.role === 'admin' || this.shouldPlayResponderAlert(currentUser, inc.category))) {
            window.soundEngine.playEscalationAlarm();
          }

          window.state.addAuditLog(`🚨🚨 [AUTO-ESCALATED] Incident ${inc.id} escalated to Admin & Backup Responder!`);
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      window.state.saveIncidents(incidents);
    }
  }

  // Check if sound should be played for this user based on responder department routing
  shouldPlayResponderAlert(user, incidentCategory) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role !== 'responder') return false;

    const routing = window.state.getDepartmentRouting();
    const type = user.responderType || 'Security';
    const allowedCategories = routing[type] || ['fire'];
    return allowedCategories.includes(incidentCategory);
  }

  // Responder Acknowledgment
  acknowledgeIncident(incidentId, responder) {
    const incidents = window.state.getIncidents();
    const inc = incidents.find(i => i.id === incidentId);
    if (!inc) return;

    const timelineEntry = {
      status: 'Acknowledged',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      note: `Acknowledged by ${responder.name} (${responder.department || 'Responder'}). Escalation timer stopped.`
    };

    inc.status = 'Acknowledged';
    inc.assignedTo = {
      name: responder.name,
      role: responder.department || responder.responderType || responder.role,
      acknowledgedAt: new Date().toISOString()
    };
    inc.timeline.unshift(timelineEntry);

    window.state.saveIncidents(incidents);
    window.state.addAuditLog(`✅ Incident ${incidentId} acknowledged by ${responder.name}`);

    // Sync update to server
    try {
      fetch('/api/incidents/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId, status: 'Acknowledged', responder, timelineEntry })
      }).catch(e => console.warn('Server sync error:', e.message));
    } catch (e) {
      console.warn('Network sync error:', e);
    }
  }

  // Update Status (En Route, On Scene, Resolved)
  async updateStatus(incidentId, newStatus, responder, notes = '') {
    const incidents = window.state.getIncidents();
    const inc = incidents.find(i => i.id === incidentId);
    if (!inc) return;

    inc.status = newStatus;
    if (newStatus === 'Resolved') {
      inc.resolvedAt = new Date().toISOString();
      inc.escalated = false;
    }
    if (responder && !inc.assignedTo) {
      inc.assignedTo = {
        name: responder.name,
        role: responder.department || responder.responderType || responder.role
      };
    }

    const timelineEntry = {
      status: newStatus,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      note: `Status marked '${newStatus}' by ${responder ? responder.name : 'Command Staff'}.${notes ? ' Note: ' + notes : ''}`
    };

    inc.timeline = inc.timeline || [];
    inc.timeline.unshift(timelineEntry);
    window.state.saveIncidents(incidents);
    window.state.addAuditLog(`ℹ️ Incident ${incidentId} status changed to ${newStatus} by ${responder ? responder.name : 'Command Staff'}`);

    // Sync update to server
    try {
      await fetch('/api/incidents/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId, status: newStatus, responder, timelineEntry })
      });
    } catch (e) {
      console.warn('Network sync error:', e);
    }
  }
}

window.alertManager = new AlertManager();
