/**
 * pm2로 실행:
 pm2 start dist/index.js \
  --name discord-bot \
  --output /home/jsb/Discord/output.log \
  --error /home/jsb/Discord/error.log

 pm2 save
 pm2 startup

  * pm2 리스트:
  pm2 list
 */

import dotenv from 'dotenv';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  ChatInputCommandInteraction,
  Colors,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { spawn, execSync, ChildProcessWithoutNullStreams } from 'child_process';
import os from 'os';

dotenv.config({ path: '/home/jsb/Discord/.env' });

// ─── 유틸 ────────────────────────────────────────────────────────────
const now = () =>
  new Date().toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

const log = (msg: string) => console.log(`[${now()}] ${msg}`);

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
};

// ─── 환경 변수 ───────────────────────────────────────────────────────
const BOT_TOKEN = process.env.DISCORD_TOKEN!;
const CLIENT_ID = process.env.CLIENT_ID!;
const ADMIN_IDS: string[] = (process.env.ADMIN_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const GITHUB_DIR = '/home/jsb/Github';
const LOG_FILE = '/home/jsb/Discord/output.log';
const ERROR_FILE = '/home/jsb/Discord/error.log';

// ─── 프로세스 관리 ──────────────────────────────────────────────────
const runningProcesses: Record<string, {
  process: ChildProcessWithoutNullStreams;
  project: string;
}> = {};

// ─── 권한 체크 ──────────────────────────────────────────────────────
const isAdmin = (userId: string) => ADMIN_IDS.includes(userId);

// ─── Embed 헬퍼 ─────────────────────────────────────────────────────
function makeEmbed(title: string, description: string, color: number = Colors.Blue) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: '🍓 Raspberry Pi Server' })
    .setTimestamp();
}

function errorEmbed(msg: string) {
  return makeEmbed('❌ 오류', msg, Colors.Red);
}

function warnEmbed(msg: string) {
  return makeEmbed('⚠️ 경고', msg, Colors.Yellow);
}

// ─── 프로젝트 헬퍼 ──────────────────────────────────────────────────
function getProjects(): string[] {
  return fs
    .readdirSync(GITHUB_DIR)
    .filter(f => fs.statSync(path.join(GITHUB_DIR, f)).isDirectory());
}

function resolveProject(input: string): string | undefined {
  const folders = getProjects();
  const idx = parseInt(input, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= folders.length) return folders[idx - 1];
  if (folders.includes(input)) return input;
  return undefined;
}

// ─── 내부 IP 헬퍼 ───────────────────────────────────────────────────
function getLocalIP(): string {
  const nets = os.networkInterfaces();
  for (const name in nets) {
    for (const iface of nets[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// ─── 프로젝트 실행 ──────────────────────────────────────────────────
function spawnProject(
  projectPath: string,
  args: string[],
): Promise<ChildProcessWithoutNullStreams | null> {
  return new Promise(resolve => {
    const child = spawn('npm', args, {
      cwd: projectPath,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    }) as unknown as ChildProcessWithoutNullStreams;
    child.unref();

    let failed = false;
    child.stderr.on('data', (data) => {
      if (/error/i.test(data.toString())) failed = true;
    });

    setTimeout(() => {
      if (failed) { log(`${args.join(' ')} 실패`); resolve(null); }
      else resolve(child);
    }, 2000);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  슬래시 명령어 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const slashCommands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('📋 사용 가능한 명령어 목록'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('📊 서버 상태 요약 (CPU / RAM / Disk / Uptime)'),

  new SlashCommandBuilder()
    .setName('temp')
    .setDescription('🌡️ 라즈베리파이 CPU 온도 확인'),

  new SlashCommandBuilder()
    .setName('ip')
    .setDescription('🌐 서버 네트워크 IP 정보'),

  new SlashCommandBuilder()
    .setName('lsp')
    .setDescription('📁 프로젝트 폴더 목록 (ls_projects)'),

  new SlashCommandBuilder()
    .setName('lss')
    .setDescription('🔧 실행 중인 서비스 상태 목록 (ls_services)'),

  new SlashCommandBuilder()
    .setName('ps')
    .setDescription('🖥️ 실행 중인 Node 프로세스 목록'),

  new SlashCommandBuilder()
    .setName('run')
    .setDescription('🚀 프로젝트 실행 (Admin)')
    .addStringOption(opt =>
      opt.setName('project').setDescription('프로젝트 번호 또는 이름').setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('🛑 프로젝트 중지 (Admin)')
    .addStringOption(opt =>
      opt.setName('project').setDescription('프로젝트 번호, 이름, 또는 all').setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('log')
    .setDescription('📜 봇 최근 로그 확인')
    .addIntegerOption(opt =>
      opt.setName('lines').setDescription('출력할 줄 수 (기본 20, 최대 50)').setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName('error')
    .setDescription('🚨 봇 에러 로그 확인'),
];

// ─── 슬래시 명령어 등록 ─────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    log('슬래시 명령어 등록 중...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: slashCommands.map(c => c.toJSON()),
    });
    log(`슬래시 명령어 ${slashCommands.length}개 등록 완료`);
  } catch (err) {
    console.error('슬래시 명령어 등록 실패:', err);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  명령어 핸들러
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── /help ────────────────────────────────────────────────────────────
async function cmdHelp(i: ChatInputCommandInteraction) {
  const guest = ['/help', '/status', '/temp', '/ip', '/lsp', '/lss', '/ps', '/log', '/error'];
  const admin = ['/run', '/stop'];

  const desc = [
    '### 📋 Guest 명령어',
    guest.map(c => `\`${c}\``).join('  '),
    '',
    '### 🔒 Admin 전용',
    admin.map(c => `\`${c}\``).join('  '),
  ].join('\n');

  await i.reply({ embeds: [makeEmbed('🛠️ 명령어 도움말', desc)], ephemeral: true });
}

// ── /status ─────────────────────────────────────────────────────────
async function cmdStatus(i: ChatInputCommandInteraction) {
  const cpuLoad = os.loadavg();
  const cpuCores = os.cpus().length;
  const cpuPercent = ((cpuLoad[0] / cpuCores) * 100).toFixed(1);

  const totalMem = os.totalmem();
  const usedMem = totalMem - os.freemem();
  const memPercent = ((usedMem / totalMem) * 100).toFixed(1);

  let diskInfo = 'N/A';
  try {
    const df = execSync('df -h / | tail -1').toString().trim().split(/\s+/);
    diskInfo = `${df[2]} / ${df[1]} (${df[4]} 사용)`;
  } catch {}

  const sec = os.uptime();
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);

  const bar = (pct: number) => {
    const filled = Math.round(pct / 10);
    return '`' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '`';
  };

  const desc = [
    `**🖥️ CPU**  ${bar(+cpuPercent)}  \`${cpuPercent}%\``,
    `> ${cpuCores}코어 · load avg ${cpuLoad.map(v => v.toFixed(2)).join(' / ')}`,
    '',
    `**🧠 RAM**  ${bar(+memPercent)}  \`${memPercent}%\``,
    `> ${formatBytes(usedMem)} / ${formatBytes(totalMem)}`,
    '',
    `**💾 Disk**  ${diskInfo}`,
    '',
    `**⏱️ Uptime**  ${d}일 ${h}시간 ${m}분`,
  ].join('\n');

  await i.reply({ embeds: [makeEmbed('📊 서버 상태', desc, Colors.Green)] });
}

// ── /temp ────────────────────────────────────────────────────────────
async function cmdTemp(i: ChatInputCommandInteraction) {
  let temp = 'N/A';
  try {
    // vcgencmd (라즈베리파이 전용) 또는 thermal_zone 폴백
    const raw = execSync(
      'vcgencmd measure_temp 2>/dev/null || cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null',
    ).toString().trim();

    if (raw.includes('temp=')) {
      temp = raw.replace('temp=', '').replace("'C", '°C');
    } else {
      temp = (parseInt(raw) / 1000).toFixed(1) + '°C';
    }
  } catch {}

  const numTemp = parseFloat(temp);
  const color = numTemp > 70 ? Colors.Red : numTemp > 55 ? Colors.Yellow : Colors.Green;
  const icon = numTemp > 70 ? '🔥' : numTemp > 55 ? '🌡️' : '❄️';

  await i.reply({ embeds: [makeEmbed(`${icon} CPU 온도`, `### ${temp}`, color)] });
}

// ── /ip ─────────────────────────────────────────────────────────────
async function cmdIp(i: ChatInputCommandInteraction) {
  const localIP = getLocalIP();

  // 공인 IP
  let publicIP = 'N/A';
  try {
    publicIP = execSync('curl -s ifconfig.me --max-time 3').toString().trim();
  } catch {}

  const desc = [
    `**🏠 내부 IP**  \`${localIP}\``,
    `**🌐 공인 IP**  \`${publicIP}\``,
  ].join('\n');

  await i.reply({ embeds: [makeEmbed('🌐 네트워크 정보', desc)] });
}

// ── /lsp ────────────────────────────────────────────────────────────
async function cmdLsp(i: ChatInputCommandInteraction) {
  const folders = getProjects();
  const list = folders.length
    ? folders.map((f, idx) => `\`${String(idx + 1).padStart(2)}\`  📂 ${f}`).join('\n')
    : '*폴더 없음*';

  await i.reply({ embeds: [makeEmbed(`📁 프로젝트 목록 (${folders.length}개)`, list)] });
}

// ── /lss ────────────────────────────────────────────────────────────

/** lsof로 LISTEN 중인 모든 (port, pid) 튜플 가져오기 */
function getListenPorts(): { port: string; pid: string }[] {
  try {
    return execSync("lsof -i -P -n | grep LISTEN || true")
      .toString()
      .split('\n')
      .filter(Boolean)
      .flatMap(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[1];
        const m = line.match(/:(\d+)\s/);
        return m ? [{ port: m[1], pid }] : [];
      });
  } catch {
    return [];
  }
}

/** PID의 cwd를 readlink로 가져오기 */
function getCwd(pid: number | undefined): string | null {
  if (!pid) return null;
  try {
    return execSync(`readlink /proc/${pid}/cwd 2>/dev/null`).toString().trim() || null;
  } catch {
    return null;
  }
}

/** pid의 cwd 기준으로 LISTEN 중인 포트 목록 반환 */
function getPortsForProcess(pid: number | undefined): string[] {
  const targetCwd = getCwd(pid);
  if (!targetCwd) return [];
  return getListenPorts()
    .filter(({ pid: p }) => getCwd(parseInt(p)) === targetCwd)
    .map(({ port }) => port)
    .filter((p, idx, arr) => arr.indexOf(p) === idx);
}

async function cmdLss(i: ChatInputCommandInteraction) {
  const projects = getProjects();
  const lines: string[] = [];

  for (const proj of projects) {
    const info = runningProcesses[proj];
    if (!info) continue;

    let alive = false;
    try { process.kill(info.process.pid!, 0); alive = true; } catch {}

    const ports = getPortsForProcess(info.process.pid);
    const localIP = getLocalIP();
    const portStr = ports.length
      ? ports.map(p => `[${p}](http://${localIP}:${p})`).join(', ')
      : '-';

    const status = alive ? '🟢' : '🔴';
    lines.push(`${status}  \`${proj}\`  pid:\`${info.process.pid}\`  port:${portStr}`);
  }

  if (lines.length === 0) lines.push('*봇에서 실행한 서비스 없음*');

  await i.reply({ embeds: [makeEmbed('🔧 서비스 상태', lines.join('\n'))] });
}

// ── /ps ─────────────────────────────────────────────────────────────
async function cmdPs(i: ChatInputCommandInteraction) {
  let output = '';
  try {
    output = execSync(
      'ps aux | grep node | grep -v vscode | grep -v grep || true',
    ).toString().trim();
  } catch {}

  if (!output) {
    await i.reply({ embeds: [makeEmbed('🖥️ Node 프로세스', '*실행 중인 Node 프로세스 없음*', Colors.Grey)] });
    return;
  }

  // 2000자 제한 대비
  const truncated = output.length > 1800 ? output.slice(0, 1800) + '\n...' : output;
  await i.reply({ embeds: [makeEmbed('🖥️ Node 프로세스', '```\n' + truncated + '\n```')] });
}

// ── /run (Admin) ────────────────────────────────────────────────────
async function cmdRun(i: ChatInputCommandInteraction) {
  const input = i.options.getString('project', true);
  const project = resolveProject(input);

  if (!project) {
    return i.reply({ embeds: [errorEmbed('유효한 프로젝트 번호 또는 이름이 아닙니다.')], ephemeral: true });
  }
  if (runningProcesses[project]) {
    return i.reply({ embeds: [warnEmbed(`\`${project}\` 는 이미 실행 중입니다.\n\`/lss\` 로 확인해보세요.`)] });
  }

  const projectPath = path.join(GITHUB_DIR, project);
  if (!fs.existsSync(projectPath)) {
    return i.reply({ embeds: [errorEmbed('프로젝트 경로가 존재하지 않습니다.')] });
  }

  // 시간이 걸릴 수 있으므로 deferred reply
  await i.deferReply();

  let child = await spawnProject(projectPath, ['run', 'dev']);
  if (!child) {
    child = await spawnProject(projectPath, ['start']);
    if (!child) {
      log(`${project} 실행 실패`);
      return i.editReply({
        embeds: [errorEmbed(`\`${project}\` 실행 실패\n\`npm start\`, \`npm run dev\` 모두 실패했습니다.`)],
      });
    }
  }
  runningProcesses[project] = { process: child, project };

  // 포트 바인딩 대기 후 감지
  await new Promise(r => setTimeout(r, 1000));
  const ports = getPortsForProcess(child.pid);
  const localIP = getLocalIP();
  const portStr = ports.length ? ports.join(', ') : '감지 중 (잠시 후 `/lss` 확인)';

  const desc = [
    `**프로젝트**  \`${project}\``,
    `**PID**  \`${child.pid}\``,
    `**PORT**  \`${portStr}\``,
  ].join('\n');

  const embed = makeEmbed('🚀 프로젝트 실행', desc, Colors.Green);
  log(`${project} 실행 시작 (PID: ${child.pid}, PORT: ${portStr})`);

  // 포트가 확인된 경우 바로가기 버튼 추가
  const components = ports.length
    ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...ports.map(p =>
          new ButtonBuilder()
            .setLabel(`🌐 :${p} 열기`)
            .setURL(`http://${localIP}:${p}`)
            .setStyle(ButtonStyle.Link),
        ),
      )]
    : [];

  await i.editReply({ embeds: [embed], components });
}

// ── /stop (Admin) ───────────────────────────────────────────────────
async function cmdStop(i: ChatInputCommandInteraction) {
  const input = i.options.getString('project', true);

  // ── all: 전체 종료 ──
  if (input === 'all') {
    const keys = Object.keys(runningProcesses);
    if (keys.length === 0) {
      return i.reply({ embeds: [warnEmbed('실행 중인 프로젝트가 없습니다.')] });
    }

    const results: string[] = [];
    for (const key of keys) {
      const info = runningProcesses[key];
      try {
        process.kill(-info.process.pid!);
        results.push(`✅  \`${key}\`  종료 완료`);
      } catch {
        results.push(`❌  \`${key}\`  종료 실패`);
      }
      delete runningProcesses[key];
    }

    return i.reply({ embeds: [makeEmbed('🛑 전체 종료', results.join('\n'), Colors.Orange)] });
  }

  // ── 개별 종료 ──
  const project = resolveProject(input);
  if (!project) {
    return i.reply({ embeds: [errorEmbed('유효한 프로젝트 번호 또는 이름이 아닙니다.')], ephemeral: true });
  }

  const proc = runningProcesses[project];
  if (!proc) {
    return i.reply({ embeds: [warnEmbed(`\`${project}\` 는 봇에서 실행 중인 프로세스가 없습니다.`)] });
  }

  try {
    process.kill(-proc.process.pid!);
    delete runningProcesses[project];
    await i.reply({
      embeds: [makeEmbed('🛑 프로젝트 종료', `\`${project}\` 종료 완료  (PID: ${proc.process.pid})`, Colors.Orange)],
    });
  } catch (err) {
    delete runningProcesses[project];
    await i.reply({ embeds: [errorEmbed(`\`${project}\` 종료 중 오류: ${(err as Error).message}`)] });
  }
}

// ── /log ────────────────────────────────────────────────────────────
async function cmdLog(i: ChatInputCommandInteraction) {
  const lineCount = Math.min(i.options.getInteger('lines') || 20, 50);
  let output = '';

  try {
    output = execSync(`tail -n ${lineCount} "${LOG_FILE}"`).toString().trim();
  } catch {
    output = '';
  }

  let body: string;
  if (!output) {
    body = '*로그 없음*';
  } else {
    const truncated = output.length > 1800 ? output.slice(0, 1800) + '\n...' : output;
    body = '```\n' + truncated + '\n```';
  }

  await i.reply({ embeds: [makeEmbed(`📜 최근 로그 (${lineCount}줄)`, body)] });
}

// ── /error ──────────────────────────────────────────────────────────
async function cmdError(i: ChatInputCommandInteraction) {
  const lineCount = 20;
  let output = '';

  try {
    output = execSync(`tail -n ${lineCount} "${ERROR_FILE}"`).toString().trim();
  } catch {
    output = '';
  }

  let body: string;
  if (!output) {
    body = '*에러 로그 없음*';
  } else {
    const truncated = output.length > 1800 ? output.slice(0, 1800) + '\n...' : output;
    body = '```\n' + truncated + '\n```';
  }

  await i.reply({ embeds: [makeEmbed(`🚨 최근 에러 로그 (${lineCount}줄)`, body, Colors.Red)] });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  클라이언트 & 이벤트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// 봇 준비 완료
client.once('ready', () => {
  log(`✅ Logged in as ${client.user?.tag}`);
  registerCommands();
});

// 슬래시 명령어 라우터
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const i = interaction;
  const userId = i.user.id;
  const cmd = i.commandName;

  log(`/${cmd} | ${i.user.tag} (${userId})`);

  // Admin 전용 명령 체크
  const adminOnly = ['run', 'stop'];
  if (adminOnly.includes(cmd) && !isAdmin(userId)) {
    return i.reply({
      embeds: [errorEmbed('🔒 이 명령어는 관리자만 사용할 수 있습니다.')],
      ephemeral: true,
    });
  }

  try {
    switch (cmd) {
      case 'help':   return cmdHelp(i);
      case 'status': return cmdStatus(i);
      case 'temp':   return cmdTemp(i);
      case 'ip':     return cmdIp(i);
      case 'lsp':    return cmdLsp(i);
      case 'lss':    return cmdLss(i);
      case 'ps':     return cmdPs(i);
      case 'run':    return cmdRun(i);
      case 'stop':   return cmdStop(i);
      case 'log':    return cmdLog(i);
      case 'error':  return cmdError(i);
    }
  } catch (err) {
    console.error(`[${now()}] /${cmd} 처리 중 오류:`, err);
    if (!i.replied && !i.deferred) {
      await i.reply({ embeds: [errorEmbed('명령 처리 중 오류가 발생했습니다.')], ephemeral: true });
    }
  }
});

// 이스터 에그 (기존 유지)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.content === 'ping') message.reply('pong');
  if (message.content === '앙') message.reply('기모띠');
});

// ─── 시작 ────────────────────────────────────────────────────────────
log('Discord 봇 시작 중...');
client.login(BOT_TOKEN);

// ─── 종료 핸들러 ────────────────────────────────────────────────────
const gracefulShutdown = (signal: string) => {
  log(`${signal} 수신 — 봇 종료 중...`);
  for (const key of Object.keys(runningProcesses)) {
    try { process.kill(-runningProcesses[key].process.pid!); } catch {}
    delete runningProcesses[key];
  }
  client.destroy();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
