// Extract only an invitation identifier. Never navigate to the supplied hostname.
export type InvitationInput = { type: 'token' | 'code'; value: string } | { type: 'room'; value: string; signature: string };
export function parseInvitationInput(input: string): InvitationInput {
  const text = input.trim();
  if (text.length > 2048) throw new Error('Invitation is too long');
  if (/^[a-f0-9]{64}$/i.test(text)) return { type: 'token', value: text.toLowerCase() };
  const code = text.replace(/[\s-]/g, '').toUpperCase();
  if (/^[A-F0-9]{12}$/.test(code)) return { type: 'code', value: code };
  try {
    const url = new URL(text, 'https://invitation.invalid');
    const tokens = url.searchParams.getAll('token');
    if (['http:', 'https:'].includes(url.protocol) && ['/join', '/tenant/join'].includes(url.pathname) &&
      tokens.length === 1 && /^[a-f0-9]{64}$/i.test(tokens[0])) {
      const rooms = url.searchParams.getAll('room');
      if (rooms.length) {
        if (rooms.length !== 1 || !/^[a-zA-Z0-9_-]{1,64}$/.test(rooms[0])) throw new Error('Invalid room');
        return { type: 'room', value: rooms[0], signature: tokens[0].toLowerCase() };
      }
      return { type: 'token', value: tokens[0].toLowerCase() };
    }
  } catch { /* Return the same safe input error for malformed URLs. */ }
  throw new Error('Paste your landlord’s invitation link or enter the invitation code');
}
