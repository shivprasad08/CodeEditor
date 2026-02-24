/**
 * Generate a random alphanumeric room ID (format: xxx-yyy-zzz)
 */
export function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 9; i++) {
    if (i === 3 || i === 6) {
      id += '-';
    }
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Validate room ID format (alphanumeric + dashes, 8-12 chars)
 */
export function isValidRoomId(roomId) {
  return /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(roomId);
}
