// Thin wrapper over the backend REST API. The base URL comes from config.js so
// the frontend can be hosted separately from the backend (see static/config.js).

export const API_BASE = (window.SD_CONFIG && window.SD_CONFIG.apiBase) || '';

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.detail;
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch {
      /* no JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  createCampaign: (campaignId, { system, gmHash }) =>
    request('POST', '/api/campaigns', {
      campaign_id: campaignId,
      system,
      gm_hash: gmHash,
    }),

  getCampaign: (campaignId) =>
    request('GET', `/api/campaigns/${encodeURIComponent(campaignId)}`),

  updateBoard: (campaignId, gmHash, board) =>
    request('PUT', `/api/campaigns/${encodeURIComponent(campaignId)}/board`, {
      gm_hash: gmHash,
      board,
    }),

  verifyBoard: (campaignId, gmHash) =>
    request('POST', `/api/campaigns/${encodeURIComponent(campaignId)}/board/verify`, {
      gm_hash: gmHash,
    }),

  createCharacter: (campaignId, editorHash, data) =>
    request('POST', `/api/campaigns/${encodeURIComponent(campaignId)}/characters`, {
      editor_hash: editorHash,
      data,
    }),

  updateCharacter: (campaignId, characterId, editorHash, data) =>
    request(
      'PUT',
      `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}`,
      { editor_hash: editorHash, data },
    ),

  deleteCharacter: (campaignId, characterId, editorHash) =>
    request(
      'DELETE',
      `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}`,
      { editor_hash: editorHash },
    ),

  verifyCharacter: (campaignId, characterId, editorHash) =>
    request(
      'POST',
      `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}/verify`,
      { editor_hash: editorHash },
    ),
};
