/* The room's downloads (services/downloads.js) as DownloadsIndicator draws them: one row per download with its
 * bar, bytes, speed and time left, and the summary the indicator shows while any of them runs. Each phrase is a
 * whole text, so the page's translation finds it. */
import { bytesText } from './stage-settings.js';

const STATES = { running: 'Descargando', done: 'Descargado', failed: 'Falló', cancelled: 'Cancelada' };
const TASKS = { stt: 'Transcripción', tts: 'Voz' };

function leftText(seconds) {
    if (seconds == null) return '';
    return seconds < 60 ? Math.max(1, seconds) + ' s' : Math.round(seconds / 60) + ' min';
}

export function downloadsView(items) {
    const list = items || [];
    const rows = list.map((item) => ({
        id: item.id, label: item.label, task: TASKS[item.task] || '', state: item.state, status: STATES[item.state] || item.state,
        fraction: item.total ? Math.min(1, item.done / item.total) : null,
        amount: item.total ? bytesText(item.done) + ' / ' + bytesText(item.total) : item.done ? bytesText(item.done) : '',
        speed: item.state === 'running' && item.bytes_per_s ? bytesText(item.bytes_per_s) + '/s' : '',
        left: item.state === 'running' ? leftText(item.eta_s) : '',
        error: item.error || '', cancellable: item.state === 'running',
    }));
    const running = list.filter((item) => item.state === 'running');
    const known = running.filter((item) => item.total);
    const total = known.reduce((sum, item) => sum + item.total, 0);
    return { rows, running: running.length,
        fraction: total ? known.reduce((sum, item) => sum + Math.min(item.done, item.total), 0) / total : null,
        failed: list.some((item) => item.state === 'failed') };
}
