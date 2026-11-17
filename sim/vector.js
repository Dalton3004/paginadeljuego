// ============================================================
// VECTOR 2D
// ============================================================
export class Vector2D {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    set(x, y) { this.x = x; this.y = y; return this; }
    copy(v) { this.x = v.x; this.y = v.y; return this; }
    clone() { return new Vector2D(this.x, this.y); }
    add(v, mult = 1) { this.x += v.x * mult; this.y += v.y * mult; return this; }
    scale(s) { this.x *= s; this.y *= s; return this; }
    length() { return Math.hypot(this.x, this.y); }
    normalize() {
        const len = this.length();
        if (len > 0.0001) { this.x /= len; this.y /= len; }
        else { this.x = 0; this.y = 0; }
        return this;
    }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
    directionTo(v) {
        const dx = v.x - this.x, dy = v.y - this.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.0001) return new Vector2D(0, 0);
        return new Vector2D(dx / len, dy / len);
    }
}

if (typeof globalThis !== 'undefined') globalThis.Vector2D = Vector2D;
