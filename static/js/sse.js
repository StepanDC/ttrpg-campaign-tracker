// Live sync: subscribe to a campaign's server-sent event stream. The server
// emits thin events (just ids); the caller re-fetches the campaign on any of
// them. EventSource auto-reconnects, so we surface connection state too.

import { API_BASE } from './api.js';

export class CampaignStream {
  constructor(campaignId, { onChange, onStatus } = {}) {
    this.campaignId = campaignId;
    this.onChange = onChange || (() => {});
    this.onStatus = onStatus || (() => {});
    this.source = null;
  }

  start() {
    const url = `${API_BASE}/api/campaigns/${encodeURIComponent(this.campaignId)}/events`;
    const es = new EventSource(url);
    this.source = es;

    es.addEventListener('connected', () => this.onStatus('online'));
    es.addEventListener('character_created', (e) => this.onChange('character_created', e));
    es.addEventListener('character_updated', (e) => this.onChange('character_updated', e));
    es.addEventListener('character_deleted', (e) => this.onChange('character_deleted', e));
    es.addEventListener('board_updated', (e) => this.onChange('board_updated', e));

    // EventSource fires onerror on disconnect and while it retries.
    es.onerror = () => this.onStatus('reconnecting');
    es.onopen = () => this.onStatus('online');
  }

  stop() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    this.onStatus('offline');
  }
}
