import asyncio
import json


class SSEManager:
    def __init__(self):
        self._subscribers: dict[str, list[asyncio.Queue]] = {}

    def subscribe(self, campaign_id: str) -> asyncio.Queue:
        if campaign_id not in self._subscribers:
            self._subscribers[campaign_id] = []
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[campaign_id].append(queue)
        return queue

    def unsubscribe(self, campaign_id: str, queue: asyncio.Queue) -> None:
        subs = self._subscribers.get(campaign_id)
        if subs:
            try:
                subs.remove(queue)
            except ValueError:
                pass

    async def broadcast(self, campaign_id: str, event: str, data: dict) -> None:
        subs = self._subscribers.get(campaign_id)
        if not subs:
            return
        message = f"event: {event}\ndata: {json.dumps(data)}\n\n"
        dead: list[asyncio.Queue] = []
        for queue in subs:
            try:
                await queue.put(message)
            except Exception:
                dead.append(queue)
        for queue in dead:
            self.unsubscribe(campaign_id, queue)
