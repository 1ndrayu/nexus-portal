export type Facilities = Record<string, boolean>;

/**
 * Hex-code generation — first 6 chars of UID, uppercased.
 */
export function generateHexCode(uid: string): string {
  if (!uid) return "000000";
  return uid.substring(0, 6).toUpperCase();
}

/* ────────────────── QR payload (browser-safe) ────────────────── */

function simpleHmac(message: string, key: string): string {
  let hash = 0;
  const combined = key + message;
  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;          // imul-style
    hash = (hash ^ (hash >>> 16)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

const SECRET = "nexus-secret-2026";

export interface QRPayload {
  uid: string;
  eventId: string;
  eventName: string;
  managerId: string;
  managerName: string;
  facilities: Facilities;
  timestamp: number;
}

export function encryptQRPayload(data: Omit<QRPayload, "timestamp">): string {
  const timestamp = Date.now();
  const payload = JSON.stringify({ 
    u: data.uid, 
    ev: data.eventId, 
    en: data.eventName,
    mi: data.managerId,
    mn: data.managerName,
    f: data.facilities, 
    t: timestamp 
  });
  const sig = simpleHmac(payload, SECRET);
  return btoa(`${payload}|${sig}`);
}

export function decryptQRPayload(encoded: string): QRPayload | null {
  try {
    const decoded = atob(encoded);
    const pipeIdx = decoded.lastIndexOf("|");
    if (pipeIdx === -1) return null;

    const payload = decoded.slice(0, pipeIdx);
    const sig = decoded.slice(pipeIdx + 1);

    if (simpleHmac(payload, SECRET) !== sig) {
      console.error("Invalid QR signature");
      return null;
    }

    const data = JSON.parse(payload);

    // Replay-attack guard — 5-minute window
    if (Date.now() - data.t > 5 * 60 * 1000) {
      console.error("QR Code expired");
      return null;
    }

    return {
      uid: data.u,
      eventId: data.ev,
      eventName: data.en,
      managerId: data.mi,
      managerName: data.mn,
      facilities: data.f,
      timestamp: data.t,
    };
  } catch {
    console.error("Failed to decrypt QR payload");
    return null;
  }
}
