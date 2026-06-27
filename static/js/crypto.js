// Password -> editor_hash. We send the SHA-256 of the player's password as the
// editor_hash; the server stores sha256(editor_hash) and never returns it.
// crypto.subtle is available because we serve over localhost (a secure context).

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
