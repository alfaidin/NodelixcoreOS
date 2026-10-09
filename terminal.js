// Terminal command lewat web (Pengaturan > Terminal). Perintah dijalankan di HP server (Termux)
// sebagai user yang sama dengan proses node; kalau perlu root, ketik: su -c '<perintah>'.
//
// Cara kerja (tanpa dependency baru, tanpa PTY):
//   POST /api/terminal/run      {cmd, cwd}  -> mulai job, balas {id, cwd}
//   GET  /api/terminal/job/:id?after=N      -> potongan output baru + status (di-poll oleh web tiap ±0,4 dtk)
//   POST /api/terminal/input    {id, data}  -> kirim teks ke stdin job yang sedang jalan
//   POST /api/terminal/kill     {id}        -> hentikan job (SIGTERM, lalu SIGKILL)
//   GET  /api/terminal/info                 -> status fitur, shell, folder awal, job yang sedang jalan
//   POST /api/terminal/enabled  {enabled}   -> hidupkan/matikan fitur (disimpan di .env: TERMINAL_ENABLED)
// Job disimpan di memori server, jadi layar HP yang mati / halaman yang di-refresh tidak menghentikan
// perintah: web tinggal tersambung lagi ke job yang masih jalan.
//
// Semua route di bawah /api/terminal sudah dilindungi login (lihat server.js).
// Pengaturan opsional di .env:
//   TERMINAL_ENABLED=true        false = fitur dimatikan (juga bisa lewat saklar di Pengaturan)
//   TERMINAL_SHELL=              default: bash/sh Termux
//   TERMINAL_CWD=                folder awal, default: $HOME
//   TERMINAL_TIMEOUT_S=300       batas waktu per perintah, 0 = tanpa batas
//   TERMINAL_MAX_OUTPUT_KB=512   output yang disimpan per perintah (bagian paling lama dibuang)
//   TERMINAL_MAX_JOBS=4          jumlah perintah yang boleh jalan bersamaan
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const E = (k, d) => (process.env[k] === undefined || process.env[k] === '') ? d : process.env[k];
const T = require('./lang');   // pesan error sesuai bahasa aktif

const MAX_CMD = 10000;          // panjang perintah maksimal (karakter)
const MAX_INPUT = 4096;         // panjang satu kiriman stdin
const KEEP_DONE_MS = 10 * 60 * 1000;
const MAX_JOBS_KEPT = 30;

// Hapus kode escape ANSI (warna, kursor, judul jendela) supaya output bersih di web
const ANSI = /\x1b\[[0-?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

// Variabel rahasia aplikasi (password admin, token Telegram, API key) tidak diwariskan ke perintah
const SECRET = /(PASSWORD|PASSWD|TOKEN|API_?KEY|SECRET)/i;
function childEnv() {
    const out = {};
    for (const [k, v] of Object.entries(process.env)) if (!SECRET.test(k) && k !== 'ADMIN_USERNAME') out[k] = v;
    out.TERM = 'dumb';
    out.NO_COLOR = '1';
    out.PAGER = 'cat';
    out.GIT_PAGER = 'cat';
    return out;
}

function pickShell() {
    const prefix = process.env.PREFIX || '/data/data/com.termux/files/usr';
    const list = [E('TERMINAL_SHELL', ''), prefix + '/bin/bash', prefix + '/bin/sh', process.env.SHELL, '/bin/bash', '/bin/sh', '/system/bin/sh'];
    return list.find(p => p && fs.existsSync(p)) || 'sh';
}

const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const home = () => { const h = E('TERMINAL_CWD', '') || process.env.HOME || os.homedir() || '/'; return isDir(h) ? h : '/'; };
const num = (k, d, min = 0) => { const n = +E(k, d); return Number.isFinite(n) && n >= min ? n : d; };

module.exports = ({ app, saveEnv }) => {
    const enabled = () => !/^(false|0|no|off)$/i.test(E('TERMINAL_ENABLED', 'true'));
    const jobs = new Map();   // id -> job

    const guard = (req, res, next) => enabled() ? next() : res.status(403).json({ error: T('term.disabled') });
    const getJob = (req, res) => {
        const j = jobs.get(String(req.params.id || (req.body || {}).id || ''));
        if (!j) res.status(404).json({ error: T('term.noJob') });
        return j;
    };
    const running = () => [...jobs.values()].filter(j => !j.done);

    function killJob(j, force) {
        if (j.done) return;
        const sig = force ? 'SIGKILL' : 'SIGTERM';
        // detached: true -> proses jadi pemimpin grup, jadi -pid mematikan juga anak-anaknya (mis. ping, sleep)
        try { process.kill(-j.child.pid, sig); } catch { try { j.child.kill(sig); } catch { } }
        if (!force && !j.killTimer) j.killTimer = setTimeout(() => killJob(j, true), 3000);
    }

    function addChunk(j, s, d) {
        if (!d) return;
        d = d.replace(ANSI, '');
        if (!d) return;
        j.chunks.push({ i: ++j.seq, s, d });
        j.size += d.length;
        const max = num('TERMINAL_MAX_OUTPUT_KB', 512, 16) * 1024;
        while (j.size > max && j.chunks.length > 1) { j.size -= j.chunks.shift().d.length; j.truncated = true; }
    }

    function start(cmd, cwd, ip) {
        const startedAt = Date.now();
        const job = { id: crypto.randomBytes(6).toString('hex'), cmd, cwd, startedAt, chunks: [], seq: 0, size: 0, truncated: false, done: false, code: null, signal: null, newCwd: cwd };
        // fd 3 dipakai shell untuk melaporkan folder akhir (supaya `cd` terasa seperti terminal biasa)
        const script = cmd + '\n__s8rc=$?\npwd >&3 2>/dev/null\nexit $__s8rc\n';
        const child = spawn(pickShell(), ['-c', script], { cwd, env: childEnv(), detached: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
        job.child = child;
        let cwdOut = '', finished = false;

        const finish = () => {
            if (finished) return; finished = true;
            clearTimeout(job.limitTimer); clearTimeout(job.killTimer);
            const p = cwdOut.trim().split('\n').pop();
            if (p && path.isAbsolute(p) && isDir(p)) job.newCwd = p;
            job.done = true; job.ms = Date.now() - startedAt;
            job.doneAt = Date.now();
            for (const s of child.stdio) { try { s && s.destroy(); } catch { } }
        };

        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); child.stdio[3].setEncoding('utf8');
        child.stdout.on('data', d => addChunk(job, 'o', d));
        child.stderr.on('data', d => addChunk(job, 'e', d));
        child.stdio[3].on('data', d => { cwdOut += d; });
        child.stdin.on('error', () => { });
        child.on('error', e => { addChunk(job, 'e', e.message + '\n'); job.code = -1; finish(); });
        // Perintah latar belakang (cmd &) bisa menahan pipa tetap terbuka: setelah shell keluar, tunggu sebentar lalu selesai
        child.on('exit', (code, signal) => { job.code = code; job.signal = signal; setTimeout(finish, 400); });
        child.on('close', finish);

        const limit = num('TERMINAL_TIMEOUT_S', 300) * 1000;
        if (limit > 0) job.limitTimer = setTimeout(() => {
            if (job.done) return;
            addChunk(job, 'e', '\n' + T('term.timeout', { s: limit / 1000 }) + '\n');
            killJob(job);
        }, limit);

        jobs.set(job.id, job);
        console.log(`[Terminal] ${ip || '-'}: ${cmd.replace(/\s+/g, ' ').slice(0, 200)}`);
        return job;
    }

    // ---- API ----
    app.get('/api/terminal/info', (req, res) => res.json({
        enabled: enabled(), shell: path.basename(pickShell()), home: home(),
        user: (() => { try { return os.userInfo().username; } catch { return ''; } })(),
        host: os.hostname(), timeout: num('TERMINAL_TIMEOUT_S', 300),
        running: running().map(j => ({ id: j.id, cmd: j.cmd, cwd: j.cwd, startedAt: j.startedAt }))
    }));

    app.post('/api/terminal/enabled', (req, res) => {
        const on = !!(req.body || {}).enabled;
        saveEnv('TERMINAL_ENABLED', on ? 'true' : 'false');
        if (!on) running().forEach(j => killJob(j, true));
        res.json({ success: true, enabled: on, message: T(on ? 'term.on' : 'term.off') });
    });

    app.post('/api/terminal/run', guard, (req, res) => {
        const b = req.body || {};
        const cmd = typeof b.cmd === 'string' ? b.cmd.replace(/\r\n?/g, '\n') : '';
        if (!cmd.trim()) return res.status(400).json({ error: T('term.empty') });
        if (cmd.length > MAX_CMD || cmd.includes('\0')) return res.status(400).json({ error: T('term.tooLong') });
        if (running().length >= num('TERMINAL_MAX_JOBS', 4, 1)) return res.status(429).json({ error: T('term.busy') });
        const cwd = typeof b.cwd === 'string' && path.isAbsolute(b.cwd) && isDir(b.cwd) ? b.cwd : home();
        // Buang job lama yang sudah selesai
        const done = [...jobs.values()].filter(j => j.done).sort((a, c) => a.doneAt - c.doneAt);
        while (jobs.size >= MAX_JOBS_KEPT && done.length) jobs.delete(done.shift().id);
        let job;
        try { job = start(cmd, cwd, req.ip); }
        catch (e) { return res.status(500).json({ error: T('term.startFail', { e: e.message }) }); }
        res.json({ success: true, id: job.id, cwd });
    });

    app.get('/api/terminal/job/:id', guard, (req, res) => {
        const j = getJob(req, res); if (!j) return;
        const after = Math.max(0, +req.query.after || 0);
        res.json({
            chunks: j.chunks.filter(c => c.i > after).map(c => ({ i: c.i, s: c.s, d: c.d })),
            truncated: j.truncated, done: j.done, code: j.code, signal: j.signal, ms: j.ms || (Date.now() - j.startedAt),
            cwd: j.done ? j.newCwd : j.cwd
        });
    });

    app.post('/api/terminal/input', guard, (req, res) => {
        const j = getJob(req, res); if (!j) return;
        const data = String((req.body || {}).data == null ? '' : req.body.data);
        if (data.length > MAX_INPUT) return res.status(400).json({ error: T('term.tooLong') });
        if (j.done || !j.child.stdin.writable) return res.status(409).json({ error: T('term.finished') });
        j.child.stdin.write(data + '\n');
        res.json({ success: true });
    });

    app.post('/api/terminal/kill', guard, (req, res) => {
        const j = getJob(req, res); if (!j) return;
        killJob(j, !!(req.body || {}).force);
        res.json({ success: true });
    });

    setInterval(() => {
        const now = Date.now();
        for (const [id, j] of jobs) if (j.done && now - j.doneAt > KEEP_DONE_MS) jobs.delete(id);
    }, 60000).unref();

    // Server berhenti -> semua perintah yang masih jalan ikut dihentikan (proses detached tidak mati sendiri)
    const killAll = () => running().forEach(j => { try { process.kill(-j.child.pid, 'SIGKILL'); } catch { } });
    process.on('exit', killAll);
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killAll(); process.exit(130); });

    return { killAll };
};
