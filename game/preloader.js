// ============================================================
// PRELOADER — progreso por bytes (real), fases menú / partido
// ============================================================
export class Preloader {
    /**
     * @param {Array<{key:string, src:string, type?:string, bytes?:number}>} assetList
     */
    constructor(assetList) {
        this.assets = {};
        this.assetList = [];
        this.loaded = 0;
        this.total = 0;
        this.bytesTotal = 0;
        this.bytesLoaded = 0;
        this._fileBytes = {};   // key → bytes estimados
        this._fileGot = {};     // key → bytes reportados (progreso parcial o final)
        this._fileDone = {};    // key → true cuando terminó
        this.onProgress = null; // (percent, key, detail)
        this.onComplete = null;
        this._finished = false;
        this._queue(assetList || []);
    }

    _queue(list) {
        for (const item of list) {
            if (!item || !item.key) continue;
            this.assetList.push(item);
            this.total++;
            const b = Math.max(0, Number(item.bytes) || 0);
            this._fileBytes[item.key] = b;
            this._fileGot[item.key] = 0;
            this.bytesTotal += b;
        }
    }

    load() {
        this._finished = false;
        if (this.total === 0) {
            this._finish();
            return;
        }
        this.assetList.forEach(item => this._loadAsset(item));
    }

    /** Suma assets (p. ej. fase partido) y los descarga; al terminar llama onComplete otra vez. */
    loadMore(extraList) {
        const list = (extraList || []).filter(i => i && i.key && !this._fileDone[i.key]);
        if (!list.length) {
            this._finish();
            return;
        }
        this._finished = false;
        this._queue(list);
        list.forEach(item => this._loadAsset(item));
    }

    _loadAsset(item) {
        const { key, src, type } = item;
        if (type && type !== 'image') {
            this._markDone(key);
            return;
        }
        const base = (typeof CONFIG !== 'undefined' && CONFIG.ASSETS_PATH) ? CONFIG.ASSETS_PATH : 'assets/';
        const url = base + src;

        const applyBlob = (blob) => {
            const size = (blob && blob.size) || 0;
            if (size > 0 && !this._fileBytes[key]) {
                this.bytesTotal += size;
                this._fileBytes[key] = size;
            }
            const objUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                try { URL.revokeObjectURL(objUrl); } catch (e) { /* ignore */ }
                this.assets[key] = img;
                this._fileGot[key] = this._fileBytes[key] || size;
                this._markDone(key);
            };
            img.onerror = () => {
                try { URL.revokeObjectURL(objUrl); } catch (e) { /* ignore */ }
                this._fail(key);
            };
            img.src = objUrl;
        };

        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'blob';
            xhr.onprogress = (e) => {
                let got = e.loaded || 0;
                if (e.lengthComputable && e.total > 0) {
                    if (!this._fileBytes[key]) {
                        this.bytesTotal += e.total;
                        this._fileBytes[key] = e.total;
                    }
                    got = Math.min(got, e.total);
                } else {
                    const est = this._fileBytes[key] || 0;
                    if (est > 0) got = Math.min(got, est);
                }
                this._fileGot[key] = got;
                this._emit(key);
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
                    applyBlob(xhr.response);
                } else {
                    this._fail(key);
                }
            };
            xhr.onerror = () => this._fail(key);
            xhr.send();
            return;
        } catch (e) { /* fallback */ }

        const img = new Image();
        img.onload = () => {
            this.assets[key] = img;
            this._fileGot[key] = this._fileBytes[key] || 0;
            this._markDone(key);
        };
        img.onerror = () => this._fail(key);
        img.src = url;
    }

    _fail(key) {
        console.error(`[Preloader] Error: ${key}`);
        const ph = this._placeholder(64, 64);
        ph.__missing = true;
        this.assets[key] = ph;
        this._fileGot[key] = this._fileBytes[key] || 0;
        this._markDone(key);
    }

    _markDone(key) {
        if (this._fileDone[key]) return;
        this._fileDone[key] = true;
        this.loaded++;
        this._fileGot[key] = this._fileBytes[key] || this._fileGot[key] || 0;
        this._emit(key);
        if (this.loaded >= this.total) this._finish();
    }

    _sumGot() {
        let n = 0;
        for (const k of Object.keys(this._fileGot)) n += this._fileGot[k] || 0;
        return n;
    }

    _emit(key) {
        this.bytesLoaded = this._sumGot();
        let percent;
        if (this.bytesTotal > 0) {
            percent = Math.floor((this.bytesLoaded / this.bytesTotal) * 100);
            if (this.loaded >= this.total) percent = 100;
            percent = Math.max(0, Math.min(100, percent));
        } else {
            percent = this.total ? Math.floor((this.loaded / this.total) * 100) : 100;
        }
        if (this.onProgress) {
            this.onProgress(percent, key, {
                loaded: this.loaded,
                total: this.total,
                bytesLoaded: this.bytesLoaded,
                bytesTotal: this.bytesTotal
            });
        }
    }

    _finish() {
        if (this._finished) return;
        this._finished = true;
        this.bytesLoaded = this.bytesTotal;
        if (this.onProgress) {
            this.onProgress(100, null, {
                loaded: this.loaded,
                total: this.total,
                bytesLoaded: this.bytesTotal,
                bytesTotal: this.bytesTotal
            });
        }
        if (this.onComplete) this.onComplete(this.assets);
    }

    _placeholder(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, w, h);
        return c;
    }
}

if (typeof globalThis !== "undefined") globalThis.Preloader = Preloader;
