// Carregador (dist/boot.js). Vem no .wgt e NUNCA é atualizado pela internet: é ele que decide
// se abre o app do pacote ou uma versão baixada (src/boot/ota.ts), e que volta atrás se ela travar.
//
// Mudou algo aqui, no index.html, no config.xml ou nas fontes? A "casca" muda (scripts/shell.ts)
// e as TVs só aceitam a versão nova reinstalando o .wgt. Por isso: pouco código, sem dependências.
import { confirmBoot, type NyxBoot, type OtaState, pickBoot, rejectBoot, type Slot, stageSlot, staged, unstaged, usedSlots } from './ota';

declare const __APP_VERSION__: string;
declare const __SHELL__: string;

const KEY = 'nyx.ota';
/** sem confirmação nesse tempo, a versão baixada é abandonada e o app recarrega com a anterior */
const WATCHDOG_MS = 30000;
const SLOTS: Slot[] = ['a', 'b'];

const codeKey = (slot: Slot, file: 'app' | 'worker') => KEY + '.' + slot + '.' + file;

function load(): unknown {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function save(s: OtaState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

function dropUnused(s: OtaState) {
  const used = usedSlots(s);
  for (const slot of SLOTS) {
    if (used.indexOf(slot) !== -1) continue;
    try {
      localStorage.removeItem(codeKey(slot, 'app'));
      localStorage.removeItem(codeKey(slot, 'worker'));
    } catch {
      // ignora
    }
  }
}

function fail(v: string) {
  const s = rejectBoot(load(), __SHELL__, v);
  save(s);
  dropUnused(s);
  location.reload();
}

function start() {
  const plan = pickBoot(load(), __APP_VERSION__, __SHELL__);
  let run = plan.run;
  let app: string | null = null;
  let worker: string | null = null;
  if (run) {
    try {
      app = localStorage.getItem(codeKey(run.slot, 'app'));
      worker = localStorage.getItem(codeKey(run.slot, 'worker'));
    } catch {
      // ignora
    }
  }
  // não conseguiu anotar a tentativa: sem anotação não há volta automática, então nem tenta
  if (run && (!app || !worker || !save(plan.state))) {
    plan.state = rejectBoot(plan.state, __SHELL__, run.v);
    run = undefined;
  }
  if (!run) save(plan.state);
  dropUnused(plan.state);

  const current = run;
  let started = false;
  let confirmed = false;
  let watchdog = 0;

  const boot: NyxBoot = {
    packaged: __APP_VERSION__,
    version: current ? current.v : __APP_VERSION__,
    shell: __SHELL__,
    ota: !!current,
    fresh: plan.fresh && !!current,
    rolledBack: plan.rolledBack,
    workerUrl: current ? URL.createObjectURL(new Blob([worker!], { type: 'text/javascript' })) : 'worker.js',
    started() {
      started = true;
    },
    ok() {
      if (confirmed) return;
      confirmed = true;
      clearTimeout(watchdog);
      if (current) save(confirmBoot(load(), __SHELL__, current.v));
    },
    pending() {
      const s = load() as OtaState | null;
      return s && s.shell === __SHELL__ && s.next && s.next.v !== boot.version ? s.next.v : undefined;
    },
    wants(v) {
      return !(current && !confirmed) && !!stageSlot(load(), __SHELL__, v, boot.version);
    },
    stage(v, appCode, workerCode) {
      // versão atual ainda não confirmada ocupa a vaga de teste
      if (current && !confirmed) return false;
      const slot = stageSlot(load(), __SHELL__, v, boot.version);
      if (!slot) return false;
      // tira a vaga do estado antes de escrever: queda no meio não deixa versão pela metade apontada
      if (!save(unstaged(load(), __SHELL__))) return false;
      try {
        localStorage.setItem(codeKey(slot, 'app'), appCode);
        localStorage.setItem(codeKey(slot, 'worker'), workerCode);
      } catch {
        // sem espaço: desiste e libera o que escreveu
        try {
          localStorage.removeItem(codeKey(slot, 'app'));
          localStorage.removeItem(codeKey(slot, 'worker'));
        } catch {
          // ignora
        }
        return false;
      }
      return save(staged(load(), __SHELL__, v, slot));
    },
  };
  (window as unknown as { NyxBoot: NyxBoot }).NyxBoot = boot;

  if (!current) {
    const s = document.createElement('script');
    s.src = 'app.js';
    document.head.appendChild(s);
    return;
  }

  // Script inline roda na hora: se o app quebrar antes do render, `started` fica falso.
  // (document.currentScript sem src → as fontes resolvem pelo index.html, que fica no pacote.)
  const s = document.createElement('script');
  s.textContent = app!;
  document.head.appendChild(s);
  if (!started) return fail(current.v);
  watchdog = window.setTimeout(() => {
    if (!confirmed) fail(current.v);
  }, WATCHDOG_MS);
}

start();
