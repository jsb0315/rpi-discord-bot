/**
 * 1시간마다 실행, 백그라운드
 nohup bash -c 'while true; do ts-node /home/jsb/Discord/index.ts; sleep 3600; done' > /home/jsb/Discord/output.log 2>&1 &
 * 실행 중인지 확인
 ps aux | grep "[t]s-node /home/jsb/Discord/index.ts"
 * 크론탭으로 재부팅시 실행 예약해놈 -e: 에디터, -l: 목록
 crontab -e
 */

import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Message, Partials } from "discord.js";
import fs from 'fs';
import path, { resolve } from 'path';
import { spawn, exec, execSync, ChildProcessWithoutNullStreams } from 'child_process';


import os from "os";

dotenv.config({ path: '/home/jsb/Discord/.env' })

const logDate = new Date().toLocaleString('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});


const prefix = ".." as const;
const cmdList = {
  help: `${prefix}help`,
  ip: `${prefix}ip`,
  port: `${prefix}port`,
  ls: `${prefix}ls`,
  run: `${prefix}run`,
  stop: `${prefix}stop`,
} as const;

type cmd = typeof cmdList[keyof typeof cmdList];

const isCmd = (value: string): value is cmd => {
  return Object.values(cmdList).includes(value.split(' ')[0] as cmd);
};

const PASSWD = `||${process.env.BOT_PASSWORD}||`;
const GITHUB_DIR = '/home/jsb/Github';
// 포트별 실행 중 프로세스 관리
const runningProcesses: Record<string, { process: any; project: string }> = {};

console.log(`[${logDate}] Discord 봇 시작 중...`);

// 디스코드 봇 토큰
const botToken = process.env.DISCORD_TOKEN;
// 웹훅 URL
const webhookURL = process.env.WEBHOOK_URL;

// 봇 클라이언트 설정 (v14 이상에서는 GatewayIntentBits 사용)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,          // 서버 관련
    GatewayIntentBits.GuildMessages,   // 메시지 읽기
    GatewayIntentBits.MessageContent,  // 메시지 내용 읽기 (필수)
    GatewayIntentBits.DirectMessages,  // DM 관련 (옵션)
  ],
  partials: [Partials.Channel] // DM 채널에서 메시지 받으려면 필요
});

// 봇 준비 완료 시 실행되는 부분
client.once('ready', () => {
  console.log(`[${logDate}] Logged in as ${client.user?.tag}`);
});


function runProject(
  projectPath: string,
  args: string[]
): Promise<ChildProcessWithoutNullStreams | null> {
  return new Promise((resolve) => {
    const child = spawn('npm', args, {
      cwd: projectPath,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'], // stderr만 감시
    }) as unknown as ChildProcessWithoutNullStreams;
    child.unref();

    let failed = false;

    child.stderr.on('data', (data) => {
      const msg = data.toString();
      if (/error/i.test(msg)) failed = true;
    });

    // 일정 시간 후 성공 판단 (서버가 띄워졌다고 가정)
    setTimeout(() => {
      if (failed) {
        console.log(`${args.join(' ')} 실패`);
        resolve(null);
      } else {
        resolve(child);
      }
    }, 2000); // 2초 후 성공 여부 판단
  });
}

async function handleRun(args: string): Promise<string> {
  const [_, projectInput, passwd] = args.split(' ');

  if (!projectInput || !passwd) return '사용법: `run [번호/프로젝트명] [||비밀번호||]`';
  if (passwd !== PASSWD) return '> **비밀번호가 올바르지 않습니다.**';

  // 현재 프로젝트 폴더 목록
  const folders = fs.readdirSync(GITHUB_DIR)
    .filter(f => fs.statSync(path.join(GITHUB_DIR, f)).isDirectory());

  // 입력이 숫자면 순서, 아니면 이름
  let project: string | undefined;
  const index = parseInt(projectInput, 10);
  if (!isNaN(index) && index >= 1 && index <= folders.length) {
    project = folders[index - 1];
  } else if (folders.includes(projectInput)) {
    project = projectInput;
  }

  if (!project) return '> **유효한 프로젝트 번호 또는 이름이 아닙니다.**';

  if (runningProcesses[project]) {
    return `> 이미 ${runningProcesses[project].project}가 실행 중입니다.`;
  }

  const projectPath = path.join(GITHUB_DIR, project);
  if (!fs.existsSync(projectPath)) return '> **프로젝트가 존재하지 않습니다.**';

  // 프로젝트 실행
  const child = await runProject(projectPath, ['start']);
  let activeChild: ChildProcessWithoutNullStreams | null = child;

  if (!child) {
    const devChild = await runProject(projectPath, ['run', 'dev']);
    console.log('start 실패, run dev 시도', devChild);
    if (!devChild) return '> **프로젝트 실행 실패**';
    activeChild = devChild;
  }

  runningProcesses[project] = { process: activeChild!, project };
  return `> ${project} 실행 시작\n> PID: \`${activeChild!.pid}\`\n> 실행 및 포트 확인: **\`${cmdList.port}\`**`;
}



async function handleStop(args: string): Promise<string> {
  const [_, projectInput, passwd] = args.split(' ');
  if (!projectInput || !passwd) return '사용법: `stop [번호/프로젝트명] [||비밀번호||]`';
  if (passwd !== PASSWD) return '> **비밀번호가 올바르지 않습니다.**';

  // 현재 프로젝트 목록 불러오기
  const folders = fs.readdirSync(GITHUB_DIR)
    .filter(f => fs.statSync(path.join(GITHUB_DIR, f)).isDirectory());

  // 입력이 숫자면 번호로, 아니면 이름으로 판단
  let project: string | undefined;
  const index = parseInt(projectInput, 10);
  if (!isNaN(index) && index >= 1 && index <= folders.length) {
    project = folders[index - 1];
  } else if (folders.includes(projectInput)) {
    project = projectInput;
  }

  if (!project) return '> **유효한 프로젝트 번호 또는 이름이 아닙니다.**';

  const procInfo = runningProcesses[project];
  if (!procInfo) return `> ${project}는 디스코드 봇에서 실행 중인 프로세스가 없습니다.`;

  try {
    // detached 프로세스 종료 (-PID로 전체 그룹 종료)
    process.kill(-procInfo.process.pid);
    delete runningProcesses[project];
    return `> ${procInfo.project} 종료 완료 (PID: ${procInfo.process.pid})`;
  } catch (err) {
    if ((err as Error).message === 'kill ESRCH') {
      console.log('프로세스 없음');
      delete runningProcesses[project];
      return `> ⚠️ ${procInfo.project} 프로세스 없음 $ {(err as Error).message}`;
    }
    console.error('프로세스 종료 실패:', err);
    return `> ⚠️ ${procInfo.project} 종료 중 오류 발생: ${(err as Error).message}`;
  }
}



// 메시지 감지 및 조건에 맞으면 웹훅 전송
client.on('messageCreate', async (message: Message) => {
  const now = new Date().toLocaleString('ko-KR');
  const user = message.author;  // 메시지를 보낸 사용자

  // 봇의 메시지는 무시
  if (user.bot) return;

  if (message.content === 'ping') {
    message.reply('pong');
  }

  if (message.content === '앙') {
    message.reply('기모띠');
  }


  const msg = message.content as cmd;

  if (isCmd(msg)) {
    let finalMsg = '';
    try {
      switch (msg.split(' ')[0]) {

        // ✅ 도움말 기능
        case cmdList.help:
          finalMsg = [
            '> 🛠 **사용 가능한 명령어 목록**',
            ...Object.values(cmdList).map(cmd => `> \`${cmd}\``),
          ].join('\n');
          break;

        // ✅ 서버 IP 알림 기능
        case cmdList.ip:
          const networkInterfaces = os.networkInterfaces();
          let serverIP = 'IP를 찾을 수 없습니다';
          // 외부 네트워크 인터페이스에서 IPv4 주소 찾기
          for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            if (!interfaces) continue; // undefined 체크

            for (const iface of interfaces) {
              // iface.family는 string | number일 수 있음, TS에서는 'IPv4' 문자열로 비교
              if (iface.family === 'IPv4' && !iface.internal) {
                serverIP = iface.address;
                break;
              }
            }
            if (serverIP !== 'IP를 찾을 수 없습니다') break;
          }
          finalMsg = `> 🌐 **서버 IP**\n> \`${serverIP}\``;
          break;

        // ✅ 포트 + 폴더 로깅 기능
        case cmdList.port:
          // 열린 포트 목록 가져오기
          const stdout = execSync("lsof -i -P -n | grep LISTEN || true").toString();
          const lines = stdout.split('\n').filter(Boolean);

          const results = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            const pid = parts[1];
            const portMatch = line.match(/:(\d+)\s/);
            const port = portMatch ? portMatch[1] : 'N/A';
            let folderName = 'unknown';

            try {
              const cwdPath = execSync(`readlink /proc/${pid}/cwd || true`).toString().trim();
              folderName = cwdPath.split('/').filter(Boolean).pop() || 'unknown';
            } catch { }

            return `${port.padEnd(6)} → ${folderName}`;
          });

          finalMsg = [
            `> 🧱 **현재 열려있는 포트** (${lines.length}개)`,
            '> ```',
            '> ' + results.join('\n> ') || '> 없음',
            '> ```'
          ].join('\n');
          break;

        // ✅ 디렉토리 목록 기능
        case cmdList.ls:
          const folders = fs
            .readdirSync(GITHUB_DIR)
            .filter(f => fs.statSync(path.join(GITHUB_DIR, f)).isDirectory());

          finalMsg = [
            `> 📁 **프로젝트 폴더 목록** (${folders.length}개)`,
            '> ```',
            '> ' +
              (folders.length
                ? folders.map((f, i) => `${i + 1}. ${f}`).join('\n> ')
                : '없음'),
            '> ```',
          ].join('\n');
          break;

        // 프로젝트 실행
        case cmdList.run:
          finalMsg = await handleRun(msg);
          break;

        // 프로젝트 중지
        case cmdList.stop:
          finalMsg = await handleStop(msg);
          break;
      }

      await user.send(finalMsg);

    } catch (err) {
      console.error(`[${now}] ${msg} 명령 처리 중 오류:`, err);
    }

    console.log(`[${now}] 전송 성공 | ${user.tag} | ${msg}`);
  }
});

// 봇 로그인
client.login(botToken);

// 봇 종료 시 실행되는 부분
process.on('SIGINT', () => {
  console.log(`[${logDate}] Discord 봇 종료 중...`);
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  const logDate = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  console.log(`[${logDate}] Discord 봇 종료 중...`);
  client.destroy();
  process.exit(0);
});
