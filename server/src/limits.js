export class SlidingWindowLimiter {
  constructor() {
    this.windows = new Map();
  }

  allow(key, limit, windowMs, now = Date.now()) {
    const recent = (this.windows.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      this.windows.set(key, recent);
      return false;
    }
    recent.push(now);
    this.windows.set(key, recent);
    return true;
  }
}

export function allowWindowHit(bucket, limit, windowMs, now = Date.now()) {
  const recent = bucket.filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    return { allowed: false, bucket: recent };
  }
  recent.push(now);
  return { allowed: true, bucket: recent };
}
