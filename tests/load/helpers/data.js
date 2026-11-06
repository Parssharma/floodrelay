/**
 * Deterministic Synthetic Data Generator for FloodRelay Load Testing
 *
 * Generates requests bounded within the North Delhi / Yamuna operational basin:
 * Latitude: 28.6500 to 28.7100
 * Longitude: 77.2000 to 77.2600
 */

const URGENCY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * Generates a pseudo-random number between min and max
 */
function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Generates a random valid citizen rescue request payload.
 */
export function generateValidRequest(idempotencyKey = null) {
  const lat = Math.round(randomRange(28.65, 28.71) * 1000000) / 1000000;
  const lng = Math.round(randomRange(77.2, 77.26) * 1000000) / 1000000;
  const peopleCount = Math.floor(randomRange(1, 8));
  const urgency = URGENCY_LEVELS[Math.floor(Math.random() * URGENCY_LEVELS.length)];
  const medicalNeeds = Math.random() > 0.7;

  const payload = {
    lat,
    lng,
    peopleCount,
    urgency,
    medicalNeeds,
    notes: `Simulated load-test rescue request (VU: ${__VU}, Iter: ${__ITER})`,
    source: 'SIMULATED',
  };

  if (idempotencyKey) {
    payload.idempotencyKey = idempotencyKey;
  }

  return payload;
}

/**
 * Generates an invalid request for negative validation tests.
 */
export function generateInvalidRequest() {
  return {
    lat: 195.0, // Invalid latitude (> 90)
    lng: 77.21,
    peopleCount: -3, // Invalid negative people count
    urgency: 'EXTREME', // Invalid urgency enum
    source: 'SIMULATED',
  };
}

/**
 * Generates a duplicate request within <= 100m of an existing point
 * (0.0008 degrees ≈ 88 meters at lat 28.6)
 */
export function generateDuplicateRequest(baseRequest, idempotencyKey = null) {
  const latOffset = (Math.random() - 0.5) * 0.0008;
  const lngOffset = (Math.random() - 0.5) * 0.0008;
  const peopleDelta = Math.random() > 0.5 ? 1 : -1;
  const peopleCount = Math.max(1, baseRequest.peopleCount + peopleDelta);

  const payload = {
    lat: Math.round((baseRequest.lat + latOffset) * 1000000) / 1000000,
    lng: Math.round((baseRequest.lng + lngOffset) * 1000000) / 1000000,
    peopleCount,
    urgency: baseRequest.urgency,
    medicalNeeds: baseRequest.medicalNeeds,
    notes: `Simulated suspected duplicate of ${baseRequest.id || 'prior'}`,
    source: 'SIMULATED',
  };

  if (idempotencyKey) {
    payload.idempotencyKey = idempotencyKey;
  }

  return payload;
}

/**
 * Generates a unique UUID-like idempotency key
 */
export function generateIdempotencyKey() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `load-${__VU}-${__ITER}-${ts}-${rand}`;
}
