/* ==========================================================================
   NeuroRead Pro — Full Production Application Logic (app.js)
   ========================================================================== */

// 1. SUPABASE CONFIGURATION (Егер өз базаңыз болса, осы жерге URL мен KEY қоясыз, 
// болмаса да жүйе LocalStorage арқылы 100% мінсіз жұмыс істей береді)
const SUPABASE_URL = ''; 
const SUPABASE_ANON_KEY = '';
let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('Supabase init skipped:', e);
  }
}

// ==========================================================================
// GLOBAL APPLICATION STATE
// ==========================================================================
const AVATAR_LIST = ['👩‍💻', '👨‍💻', '🚀', '⚡', '🧠', '🦊'];

const appState = {
  currentUser: null,
  selectedAvatar: '👩‍💻',
  lang: localStorage.getItem('nr_lang') || 'kz',
  muted: false
};

// ==========================================================================
// TOAST & MODAL HELPERS
// ==========================================================================
function showToast(message, type = 'success') {
  const toast = document.getElementById('toastNotification');
  const icon = document.getElementById('toastIcon');
  const msg = document.getElementById('toastMessage');
  if (!toast || !msg) return;

  msg.textContent = message;
  if (type === 'error') {
    icon.className = 'w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-sm shrink-0';
    icon.textContent = '!';
  } else {
    icon.className = 'w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0';
    icon.textContent = '✓';
  }

  toast.classList.remove('translate-x-32', 'opacity-0', 'pointer-events-none');
  setTimeout(() => {
    toast.classList.add('translate-x-32', 'opacity-0', 'pointer-events-none');
  }, 3200);
}

const modals = {
  open(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  },
  close(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }
};

// ==========================================================================
// WEB AUDIO SYNTHESIZER (ДЫБЫС ЭФФЕКТІЛЕРІ МЕН МЕТРОНОМ)
// ==========================================================================
const audioEngine = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  },
  playTone(freq = 600, duration = 0.05, type = 'sine', gainVal = 0.08) {
    if (appState.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  },
  click() { this.playTone(720, 0.04, 'triangle', 0.07); },
  error() { this.playTone(220, 0.15, 'sawtooth', 0.1); },
  success() {
    this.playTone(523.25, 0.08, 'sine', 0.1);
    setTimeout(() => this.playTone(659.25, 0.12, 'sine', 0.1), 90);
  },
  toggleMute() {
    appState.muted = !appState.muted;
    document.getElementById('soundIconOn').classList.toggle('hidden', appState.muted);
    document.getElementById('soundIconOff').classList.toggle('hidden', !appState.muted);
    showToast(appState.muted ? 'Дыбыс өшірілді' : 'Дыбыс қосылды');
  }
};

// ==========================================================================
// AUTHENTICATION & SESSION PERSISTENCE MANAGER
// (Тек тіркелген логин-парольмен кіру + Сессияны сақтау + Google + Қонақ)
// ==========================================================================
const authManager = {
  USERS_KEY: 'neuroread_registered_accounts_v3',
  SESSION_KEY: 'neuroread_active_session_v3',

  init() {
    this.renderAvatarSelector();
    const savedSession = localStorage.getItem(this.SESSION_KEY);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed && parsed.email) {
          // Егер тіркелген қолданушы болса, базадан соңғы дерегін аламыз
          const users = this.getUsers();
          const fresh = users.find(u => u.email.toLowerCase() === parsed.email.toLowerCase()) || parsed;
          this.setActiveUser(fresh, false);
          return;
        }
      } catch (e) {
        localStorage.removeItem(this.SESSION_KEY);
      }
    }
    // Активті сессия жоқ болса — кіру терезесін ашамыз
    document.getElementById('authModal').classList.remove('hidden');
  },

  getUsers() {
    try {
      return JSON.parse(localStorage.getItem(this.USERS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  },

  saveUsers(list) {
    localStorage.setItem(this.USERS_KEY, JSON.stringify(list));
  },

  renderAvatarSelector() {
    const container = document.getElementById('avatarSelector');
    if (!container) return;
    container.innerHTML = '';
    AVATAR_LIST.forEach(av => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = av;
      const isSelected = av === appState.selectedAvatar;
      btn.className = `py-2 rounded-xl text-base border transition ${
        isSelected
          ? 'bg-brand-600/30 border-brand-500 scale-105 shadow'
          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
      }`;
      btn.onclick = () => {
        appState.selectedAvatar = av;
        this.renderAvatarSelector();
      };
      container.appendChild(btn);
    });
  },

  switchTab(tab) {
    this.hideError();
    const isSignIn = tab === 'signin';
    document.getElementById('formSignIn').classList.toggle('hidden', !isSignIn);
    document.getElementById('formSignUp').classList.toggle('hidden', isSignIn);

    document.getElementById('tabBtnSignIn').className = isSignIn
      ? 'flex-1 py-2.5 rounded-xl bg-brand-600 text-white shadow-md transition'
      : 'flex-1 py-2.5 rounded-xl text-slate-400 hover:text-white transition';

    document.getElementById('tabBtnSignUp').className = !isSignIn
      ? 'flex-1 py-2.5 rounded-xl bg-brand-600 text-white shadow-md transition'
      : 'flex-1 py-2.5 rounded-xl text-slate-400 hover:text-white transition';
  },

  showError(msg) {
    const box = document.getElementById('authErrorBox');
    const txt = document.getElementById('authErrorText');
    if (box && txt) {
      txt.textContent = msg;
      box.classList.remove('hidden');
    }
    audioEngine.error();
  },

  hideError() {
    const box = document.getElementById('authErrorBox');
    if (box) box.classList.add('hidden');
  },

  togglePassVisibility(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    if (inp.type === 'password') {
      inp.type = 'text';
      btn.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
    } else {
      inp.type = 'password';
      btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
    }
  },

  // ТІРКЕЛУ (ЖАҢА АККАУНТ АШУ)
  handleSignUp(e) {
    e.preventDefault();
    this.hideError();

    const name = document.getElementById('regFullName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const password = document.getElementById('regPassword').value;

    if (name.length < 2) {
      return this.showError('Аты-жөніңізді толық жазыңыз.');
    }
    if (password.length < 6) {
      return this.showError('Құпиясөз кемінде 6 таңбадан тұруы керек.');
    }

    const users = this.getUsers();
    if (users.some(u => u.email.toLowerCase() === email)) {
      return this.showError('Бұл логин немесе Email бұрын тіркелген! «Жүйеге кіру» бөлімі арқылы кіріңіз.');
    }

    const newUser = {
      name,
      email,
      password,
      avatar: appState.selectedAvatar,
      xp: 50,
      level: 1,
      maxWpm: 0,
      wordsRead: 0,
      ersHistory: [],
      authType: 'registered',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.saveUsers(users);
    this.setActiveUser(newUser, true);
    showToast(`Қош келдіңіз, ${name}! Тіркелу үшін +50 XP берілді.`);
    analyticsManager.recordRealActivity('Жаңа аккаунт тіркелді', 0, 0, 100);
  },

  // КІРУ (ТЕК ТІРКЕЛГЕН ЛОГИН ЖӘНЕ ПАРОЛЬМЕН ҒАНА КІРГІЗЕДІ)
  handleSignIn(e) {
    e.preventDefault();
    this.hideError();

    const identifier = document.getElementById('loginIdentifier').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    const users = this.getUsers();
    const foundUser = users.find(
      u => u.email.toLowerCase() === identifier || u.name.toLowerCase() === identifier
    );

    if (!foundUser) {
      return this.showError('Мұндай логин немесе Email табылмады! Алдымен «Тіркелу» бөлімінде тіркеліңіз.');
    }

    if (foundUser.password !== password) {
      return this.showError('Құпиясөз қате! Қайта тексеріп енгізіңіз.');
    }

    this.setActiveUser(foundUser, true);
    showToast(`Қайта оралуыңызбен, ${foundUser.name}!`);
    analyticsManager.recordRealActivity('Жүйеге кірді (Login)', foundUser.maxWpm || 0, foundUser.maxWpm || 0, 100);
  },

  // GOOGLE АККАУНТПЕН КІРУ (GOOGLE IDENTITY SERVICES)
  loginWithGoogle() {
    if (!window.google) {
      showToast('Google кызматы жүктөлүүдө, бир аз күтө туруңуз...', 'error');
      return;
    }

    window.google.accounts.id.initialize({
      client_id: '450536619746-vl5henj93uftjbrp0crei8v12d7uiapu.apps.googleusercontent.com',
      callback: (response) => {
        try {
          const base64Url = response.credential.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const data = JSON.parse(decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));

          if (data && data.email) {
            const email = data.email.toLowerCase();
            const name = data.name || 'Google User';

            const users = this.getUsers();
            let user = users.find(u => u.email.toLowerCase() === email);

            if (!user) {
              user = {
                name: name,
                email: email,
                password: 'google_oauth_protected',
                avatar: '🚀',
                xp: 100,
                level: 1,
                maxWpm: 0,
                wordsRead: 0,
                ersHistory: [],
                authType: 'google',
                createdAt: new Date().toISOString()
              };
              users.push(user);
              this.saveUsers(users);
            }

            this.setActiveUser(user, true);
            showToast(`Google аркылуу кирдиңиз: ${name}!`);
            analyticsManager.recordRealActivity('Google Auth аркылуу кирди', user.maxWpm || 0, 0, 100);
          }
        } catch (err) {
          showToast('Google аркылуу кирүүдө ката кетти', 'error');
        }
      }
    });

    window.google.accounts.id.prompt();
  },

  // ҚОНАҚ АККАУНТ (ГОСТЬ / DEMO)
  loginAsGuest() {
    const guestUser = {
      name: 'Қонақ (Гость)',
      email: 'guest@neuroread.kz',
      avatar: '👨‍🚀',
      xp: 0,
      level: 1,
      maxWpm: 0,
      wordsRead: 0,
      ersHistory: [],
      authType: 'guest'
    };
    this.setActiveUser(guestUser, true);
    showToast('Сіз Қонақ режимінде кірдіңіз');
    analyticsManager.recordRealActivity('Қонақ ретінде кірді', 0, 0, 100);
  },

  setActiveUser(user, playSound = false) {
    appState.currentUser = user;
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
    document.getElementById('authModal').classList.add('hidden');
    if (playSound) audioEngine.success();
    this.syncHeaderUI();
    analyticsManager.renderAll();
  },

  addXP(amount, wordsAdded = 0, newErs = 0) {
    if (!appState.currentUser) return;
    const u = appState.currentUser;
    u.xp = (u.xp || 0) + amount;
    u.wordsRead = (u.wordsRead || 0) + wordsAdded;
    u.level = Math.floor(u.xp / 250) + 1;

    if (newErs > 0) {
      if (!u.ersHistory) u.ersHistory = [];
      u.ersHistory.push({ ers: newErs, date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      if (newErs > (u.maxWpm || 0)) u.maxWpm = newErs;
    }

    // Сақтау
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(u));
    if (u.authType !== 'guest') {
      const users = this.getUsers();
      const idx = users.findIndex(item => item.email.toLowerCase() === u.email.toLowerCase());
      if (idx !== -1) {
        users[idx] = u;
        this.saveUsers(users);
      }
    }
    this.syncHeaderUI();
  },

  getRankTitle(level) {
    if (level >= 8) return 'Neuro Architect';
    if (level >= 5) return 'Senior Reader';
    if (level >= 3) return 'Middle Reader';
    return 'Junior Reader';
  },

  syncHeaderUI() {
    const u = appState.currentUser;
    if (!u) return;

    const lvl = u.level || 1;
    const xp = u.xp || 0;
    const xpInLevel = xp % 250;
    const pct = Math.min(100, Math.round((xpInLevel / 250) * 100));

    document.getElementById('headerUserAvatar').textContent = u.avatar || '👩‍💻';
    document.getElementById('headerUserName').textContent = u.name;
    document.getElementById('headerUserEmail').textContent = `L${lvl} • ${xp} XP`;

    document.getElementById('badgeUserLevel').textContent = `L${lvl}`;
    document.getElementById('headerRankLabel').textContent = this.getRankTitle(lvl);
    document.getElementById('userXpText').textContent = `${xpInLevel}/250`;
    document.getElementById('userXpBar').style.width = `${pct}%`;
  },

  showAccountInfo() {
    const u = appState.currentUser;
    if (!u) return;
    document.getElementById('profileModalAvatar').textContent = u.avatar || '👩‍💻';
    document.getElementById('profileModalName').textContent = u.name;
    document.getElementById('profileModalEmail').textContent = u.email;
    document.getElementById('profileModalRole').textContent = `Rank: ${this.getRankTitle(u.level || 1)}`;
    document.getElementById('profileModalLevel').textContent = `Level ${u.level || 1} (${u.xp || 0} XP)`;
    document.getElementById('profileModalMaxWpm').textContent = `${u.maxWpm || 0} ERS`;
    modals.open('accountModal');
  },

  logout() {
    rsvpEngine.pause();
    pacerEngine.stopAll();
    localStorage.removeItem(this.SESSION_KEY);
    appState.currentUser = null;
    document.getElementById('authModal').classList.remove('hidden');
    showToast('Сіз аккаунттан шықтыңыз');
  }
};

// ==========================================================================
// ROUTER (МОДУЛЬДЕР АРАСЫНДА АУЫСУ)
// ==========================================================================
const router = {
  modules: ['rsvp', 'schulte', 'saccade', 'pacer', 'diagnostic', 'analytics'],
  navigate(target) {
    rsvpEngine.pause();
    pacerEngine.stopAll();

    this.modules.forEach(m => {
      const sec = document.getElementById(`module-${m}`);
      if (sec) sec.classList.toggle('hidden', m !== target);

      const navBtn = document.getElementById(`nav-${m}`);
      if (navBtn) {
        navBtn.className = m === target
          ? 'nav-link px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 text-white bg-brand-600 shadow-md'
          : 'nav-link px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 text-slate-300 hover:text-white hover:bg-slate-800/60';
      }

      const mobBtn = document.getElementById(`mob-${m}`);
      if (mobBtn) {
        mobBtn.className = m === target
          ? 'flex flex-col items-center gap-1 text-brand-400 font-bold p-1'
          : 'flex flex-col items-center gap-1 text-slate-400 p-1';
      }
    });

    if (target === 'schulte') schulteEngine.startNewGame();
    if (target === 'saccade') saccadeEngine.generatePyramid();
    if (target === 'analytics') analyticsManager.renderAll();
  }
};

// ==========================================================================
// NEURO-WARMUP VIDEO MANAGER (videos/eyes.mp4, fingers.mp4, brain.mp4)
// ==========================================================================
const neuroWarmup = {
  open() {
    rsvpEngine.pause();
    modals.open('neuroWarmupModal');
    this.selectVideo('eyes');
  },
  close() {
    const player = document.getElementById('warmupVideoPlayer');
    if (player) player.pause();
    modals.close('neuroWarmupModal');
  },
  selectVideo(type) {
    const player = document.getElementById('warmupVideoPlayer');
    const hint = document.getElementById('warmupHintText');
    const tabs = {
      eyes: {
        btn: 'tabWarmupEyes',
        src: 'videos/eyes.mp4',
        hint: '💡 Көз жаттығуы: Басыңызды қозғалтпай, экрандағы объектіні тек көзбен қадағалаңыз.'
      },
      fingers: {
        btn: 'tabWarmupFingers',
        src: 'videos/fingers.mp4',
        hint: '💡 Саусақ жаттығуы: Видеодағы нейро-қимылдарды екі қолмен синхронды қайталаңыз.'
      },
      brain: {
        btn: 'tabWarmupBrain',
        src: 'videos/brain.mp4',
        hint: '💡 Зейін фокусы: Тынысыңызды реттеп, ми жартышарларының жұмысын үйлестіріңіз.'
      }
    };

    Object.keys(tabs).forEach(k => {
      const b = document.getElementById(tabs[k].btn);
      if (b) {
        b.className = k === type
          ? 'py-2 rounded-xl bg-brand-600 text-white shadow transition'
          : 'py-2 rounded-xl text-slate-400 hover:text-white transition';
      }
    });

    if (player && tabs[type]) {
      player.src = tabs[type].src;
      player.load();
      player.play().catch(() => {});
      if (hint) hint.textContent = tabs[type].hint;
    }
  }
};

// ==========================================================================
// IT TEXT PRESETS DATABASE
// ==========================================================================
const IT_PRESETS = {
  algorithms: {
    title: 'Алгоритмдер теориясы және Big O',
    text: 'Алгоритм дегеніміз — берілген есепті шешу үшін орындаушыға берілетін нақты әрі түсінікті командалар тізбегі. Бағдарламалауда алгоритмнің тиімділігі уақыттық және кеңістіктік күрделілікпен өлшенеді. Оны сипаттау үшін үлкен О нотациясы қолданылады. Мысалы, екілік іздеу алгоритмі сұрыпталған массивте элементті логарифмдік уақытта табады, ал көпіршікті сұрыптау квадраттық уақытты қажет етеді. Жоғары жүктемелі жүйелерді құру кезінде деректер құрылымын дұрыс таңдау сервер ресурстарын ондаған есе үнемдеуге мүмкіндік береді.'
  },
  python: {
    title: 'Python және ООП парадигмасы',
    text: 'Python — оқылуы жеңіл синтаксисімен және қуатты экожүйесімен ерекшеленетін жоғары деңгейлі бағдарламалау тілі. Объектіге бағытталған бағдарламалау парадигмасы төрт негізгі қағидатқа сүйенеді: инкапсуляция, мұрагерлік, полиморфизм және абстракция. Инкапсуляция деректерді сыртқы тікелей өзгерістерден қорғайды, ал мұрагерлік бар кластың қасиеттерін жаңа класта қайта пайдалануға жол ашады. Қазіргі таңда Python жасанды интеллект, деректерді талдау және серверлік веб-қосымшалар әзірлеуде әлемдік көшбасшы саналады.'
  },
  architecture: {
    title: 'Компьютер архитектурасы (CPU/NPU)',
    text: 'Фон Нейман архитектурасы бойынша компьютердің негізгі тораптарына арифметикалық-логикалық құрылғы, басқару блогы, жедел жады және енгізу-шығару жүйелері кіреді. Орталық процессор командаларды конвейерлік цикл арқылы миллиардтаған герц жиілікте орындайды. Кэш-жадының үш деңгейі процессор мен жедел жады арасындағы жылдамдық айырмашылығын теңестіреді. Ал заманауи чиптерге енгізілген нейрондық процессорлар матрицалық есептеулерді аппараттық деңгейде жеделдетеді.'
  },
  databases: {
    title: 'Деректер қоры және SQL',
    text: 'Реляциялық деректер қоры ақпаратты өзара байланысқан кестелер түрінде сақтайды. Деректердің тұтастығы мен сенімділігін қамтамасыз ету үшін транзакциялар ACID талаптарына бағынады: атомарлық, консистенттілік, оқшаулану және тұрақтылық. SQL тілі арқылы күрделі сұраныстар жасалып, индекстер көмегімен миллиондаған жазбалар арасынан қажетті ақпарат миллисекунд ішінде табылады. Ал бұлттық PostgreSQL және Supabase платформалары нақты уақыттағы синхрондауды жеңілдетеді.'
  },
  networks: {
    title: 'Желілік хаттамалар (OSI, TCP/IP)',
    text: 'Компьютерлік желілерде деректерді тасымалдау ашық жүйелердің өзара әрекеттесу моделінің жеті деңгейі бойынша жүзеге асады. TCP хаттамасы пакеттердің жоғалмай, ретімен жеткізілуін кепілдендіреді, ал UDP хаттамасы бейнеағындар мен онлайн ойындар үшін минималды кідірісті қамтамасыз етеді. Домендік атаулар жүйесі сайт атауларын IP мекенжайларға түрлендіреді, ал криптографиялық TLS сертификаттары клиент пен сервер арасындағы трафикті шифрлайды.'
  }
};

// ==========================================================================
// MODULE 1: RSVP SPRITZ ENGINE
// ==========================================================================
const rsvpEngine = {
  words: [],
  index: 0,
  wpm: 350,
  chunkSize: 1,
  useORP: true,
  usePunctDelay: true,
  playing: false,
  timer: null,

  init() {
    this.loadSelectedPreset('algorithms');
  },

  loadSelectedPreset(key) {
    const preset = IT_PRESETS[key] || IT_PRESETS.algorithms;
    document.getElementById('rsvpCurrentTopicBadge').textContent = preset.title;
    this.setText(preset.text);
  },

  setText(rawText) {
    this.pause();
    this.words = rawText.trim().split(/\s+/).filter(Boolean);
    this.index = 0;
    this.renderCurrentFrame();
  },

  setWPM(val) {
    this.wpm = parseInt(val, 10) || 350;
    document.getElementById('spritzWpmNum').textContent = this.wpm;
    document.getElementById('spritzLiveWPM').textContent = `${this.wpm} WPM`;
    this.updateProgressUI();
  },

  setChunk(size) {
    this.chunkSize = size;
    [1, 2, 3].forEach(n => {
      const btn = document.getElementById(`chunkBtn${n}`);
      if (btn) {
        btn.className = n === size
          ? 'py-2 rounded-xl text-xs font-bold bg-brand-600 text-white shadow'
          : 'py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700';
      }
    });
    this.renderCurrentFrame();
  },

  toggleORP(checked) {
    this.useORP = checked;
    this.renderCurrentFrame();
  },

  togglePunctuation(checked) {
    this.usePunctDelay = checked;
  },

  renderCurrentFrame() {
    const leftEl = document.getElementById('spritzLeft');
    const centerEl = document.getElementById('spritzCenter');
    const rightEl = document.getElementById('spritzRight');
    if (!leftEl || !centerEl || !rightEl) return;

    if (!this.words.length) {
      leftEl.textContent = '';
      centerEl.textContent = '—';
      rightEl.textContent = '';
      return;
    }

    const chunk = this.words.slice(this.index, this.index + this.chunkSize).join(' ');
    const pivot = chunk.length <= 1 ? 0 : chunk.length <= 5 ? 1 : chunk.length <= 9 ? 2 : 3;

    leftEl.textContent = chunk.slice(0, pivot);
    centerEl.textContent = chunk.charAt(pivot);
    centerEl.style.color = this.useORP ? '#f43f5e' : '#f8fafc';
    rightEl.textContent = chunk.slice(pivot + 1);

    this.updateProgressUI();
  },

  updateProgressUI() {
    const total = this.words.length;
    const current = Math.min(total, this.index + 1);
    const pct = total ? Math.round((current / total) * 100) : 0;

    document.getElementById('spritzProgressWordCount').textContent = `${current} / ${total} сөз (${pct}%)`;
    document.getElementById('spritzProgressBar').style.width = `${pct}%`;

    const remWords = Math.max(0, total - current);
    const totalSec = Math.ceil((remWords / this.wpm) * 60);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    document.getElementById('spritzEstTime').textContent = `${mm}:${ss}`;
  },

  togglePlay() {
    if (this.playing) {
      this.pause();
    } else {
      if (this.index >= this.words.length - 1) this.index = 0;
      this.playing = true;
      document.getElementById('rsvpPlayBtnText').textContent = 'Кідірту (Бос орын)';
      this.step();
    }
  },

  pause() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    const btnTxt = document.getElementById('rsvpPlayBtnText');
    if (btnTxt) btnTxt.textContent = 'Бастау (Бос орын)';
  },

  step() {
    if (!this.playing) return;
    this.renderCurrentFrame();

    const currentChunk = this.words.slice(this.index, this.index + this.chunkSize).join(' ');
    let delay = (60000 / this.wpm) * this.chunkSize;
    if (this.usePunctDelay && /[.,!?;:—]/.test(currentChunk)) {
      delay *= 1.45;
    }

    if (this.index + this.chunkSize < this.words.length) {
      this.index += this.chunkSize;
      this.timer = setTimeout(() => this.step(), delay);
    } else {
      this.pause();
      audioEngine.success();
      authManager.addXP(25, this.words.length, this.wpm);
      analyticsManager.recordRealActivity(`RSVP оқу (${this.wpm} WPM)`, this.wpm, this.wpm, 100);
      showToast(`Мәтін оқылып бітті! +25 XP (${this.wpm} WPM)`);
    }
  },

  skipWords(delta) {
    this.index = Math.max(0, Math.min(this.words.length - 1, this.index + delta));
    this.renderCurrentFrame();
  },

  seekTimeline(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.index = Math.floor(ratio * (this.words.length - 1));
    this.renderCurrentFrame();
  },

  applyCustomText() {
    const txt = document.getElementById('customTextInput').value.trim();
    if (!txt) return showToast('Мәтін енгізіңіз!', 'error');
    document.getElementById('rsvpCurrentTopicBadge').textContent = 'Жеке конспект';
    this.setText(txt);
    modals.close('customTextModal');
    showToast('Мәтін сәтті жүктелді!');
  },

  handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('rsvpCurrentTopicBadge').textContent = file.name;
      this.setText(ev.target.result);
      showToast(`${file.name} жүктелді!`);
    };
    reader.readAsText(file);
  }
};

// ==========================================================================
// MODULE 2: SCHULTE MATRIX ENGINE
// ==========================================================================
const schulteEngine = {
  size: 5,
  mode: 'classic',
  sequence: [],
  stepIndex: 0,
  mistakes: 0,
  startTime: 0,
  timerInterval: null,

  setSize(s) {
    this.size = s;
    [3, 4, 5, 6].forEach(n => {
      const btn = document.getElementById(`schulteSize${n}`);
      if (btn) {
        btn.className = n === s
          ? 'px-3 py-1.5 rounded-xl bg-brand-600 text-white shadow-md'
          : 'px-3 py-1.5 rounded-xl text-slate-300';
      }
    });
    this.startNewGame();
  },

  setMode(m) {
    this.mode = m;
    ['Classic', 'Gorbov', 'Letters'].forEach(label => {
      const btn = document.getElementById(`schulteMode${label}`);
      if (btn) {
        btn.className = label.toLowerCase() === m
          ? 'px-3 py-1.5 rounded-xl bg-slate-700 text-white'
          : 'px-3 py-1.5 rounded-xl text-slate-300 hover:text-white';
      }
    });
    this.startNewGame();
  },

  startNewGame() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.stepIndex = 0;
    this.mistakes = 0;
    document.getElementById('schulteMistakeCount').textContent = '0';
    document.getElementById('schulteLiveTimer').textContent = '00.00';

    const total = this.size * this.size;
    let items = [];

    if (this.mode === 'classic') {
      for (let i = 1; i <= total; i++) items.push({ label: String(i), color: 'default' });
      this.sequence = [...items];
    } else if (this.mode === 'gorbov') {
      const half = Math.ceil(total / 2);
      const blacks = [];
      const reds = [];
      for (let i = 1; i <= half; i++) blacks.push({ label: String(i), color: 'black' });
      for (let i = total - half; i >= 1; i--) reds.push({ label: String(i), color: 'red' });
      this.sequence = [];
      for (let i = 0; i < Math.max(blacks.length, reds.length); i++) {
        if (blacks[i]) this.sequence.push(blacks[i]);
        if (reds[i]) this.sequence.push(reds[i]);
      }
      items = [...this.sequence];
    } else {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.slice(0, total).split('');
      items = chars.map(c => ({ label: c, color: 'default' }));
      this.sequence = [...items];
    }

    const shuffled = [...items].sort(() => Math.random() - 0.5);
    const grid = document.getElementById('schulteGridContainer');
    grid.style.gridTemplateColumns = `repeat(${this.size}, minmax(0, 1fr))`;
    grid.innerHTML = '';

    shuffled.forEach(item => {
      const btn = document.createElement('button');
      let colorCls = 'bg-slate-950 border-slate-800 text-white hover:border-brand-500';
      if (item.color === 'red') colorCls = 'bg-rose-950/60 border-rose-500/40 text-rose-300';
      if (item.color === 'black') colorCls = 'bg-slate-900 border-slate-700 text-slate-100';

      btn.className = `schulte-cell border rounded-2xl font-mono font-extrabold text-base sm:text-xl flex items-center justify-center shadow ${colorCls}`;
      btn.textContent = item.label;
      btn.onclick = () => this.handleCellClick(item, btn);
      grid.appendChild(btn);
    });

    this.updateTargetBadge();
    this.startTime = performance.now();
    this.timerInterval = setInterval(() => {
      const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(2);
      document.getElementById('schulteLiveTimer').textContent = elapsed;
    }, 60);
  },

  updateTargetBadge() {
    const cur = this.sequence[this.stepIndex];
    if (!cur) return;
    document.getElementById('schulteTargetVal').textContent = cur.label;
    const tag = document.getElementById('schulteTargetColorTag');
    if (cur.color === 'red') {
      tag.className = 'w-3 h-3 rounded-full bg-rose-500 inline-block';
    } else if (cur.color === 'black') {
      tag.className = 'w-3 h-3 rounded-full bg-slate-400 inline-block';
    } else {
      tag.className = 'hidden';
    }
  },

  handleCellClick(item, btn) {
    const expected = this.sequence[this.stepIndex];
    if (!expected) return;

    if (item.label === expected.label && item.color === expected.color) {
      audioEngine.click();
      btn.classList.add('opacity-35', 'scale-95', 'pointer-events-none', 'border-cyber-teal');
      this.stepIndex++;
      if (this.stepIndex >= this.sequence.length) {
        clearInterval(this.timerInterval);
        const finalSec = ((performance.now() - this.startTime) / 1000).toFixed(2);
        audioEngine.success();
        authManager.addXP(35, 25, 0);
        analyticsManager.recordRealActivity(`Шульте ${this.size}x${this.size} (${finalSec}с)`, 0, 0, 100);
        showToast(`Керемет! Шульте ${this.size}×${this.size} уақыты: ${finalSec} сек (+35 XP)`);
      } else {
        this.updateTargetBadge();
      }
    } else {
      this.mistakes++;
      document.getElementById('schulteMistakeCount').textContent = this.mistakes;
      audioEngine.error();
    }
  }
};

// ==========================================================================
// MODULE 3: SACCADE PYRAMID & IT-TACHISTOSCOPE
// ==========================================================================
const saccadeEngine = {
  flashDuration: 120,
  currentTerm: '',
  terms: [
    'ALGORITHM', 'COMPILER', 'DATABASE', 'FIREWALL', 'PROTOCOL',
    'RECURSION', 'VARIABLE', 'FUNCTION', 'ETHERNET', 'DOCKER',
    'KUBERNETES', 'POSTGRES', 'SUPABASE', 'TYPESCRIPT', 'ENCRYPTION'
  ],

  setSubTab(tab) {
    const isPyr = tab === 'pyramid';
    document.getElementById('saccadePyramidView').classList.toggle('hidden', !isPyr);
    document.getElementById('saccadeTachistoView').classList.toggle('hidden', isPyr);

    document.getElementById('subtab-pyramid').className = isPyr
      ? 'px-4 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white shadow-md'
      : 'px-4 py-2 rounded-xl text-slate-300 hover:text-white';
    document.getElementById('subtab-tachisto').className = !isPyr
      ? 'px-4 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white shadow-md'
      : 'px-4 py-2 rounded-xl text-slate-300 hover:text-white';
  },

  generatePyramid() {
    const container = document.getElementById('pyramidListContainer');
    if (!container) return;
    container.innerHTML = '';
    const codes = ['CPU', 'RAM', 'SQL', 'API', 'DOM', 'DNS', 'TCP', 'UDP', 'SSH', 'SSL', 'GPU', 'NPU', 'IDE', 'GIT'];

    for (let i = 1; i <= 7; i++) {
      const left = codes[Math.floor(Math.random() * codes.length)];
      const right = codes[Math.floor(Math.random() * codes.length)];
      const gap = i * 22;

      const row = document.createElement('div');
      row.className = 'flex items-center justify-center w-full';
      row.innerHTML = `
        <span class="text-slate-200">${left}</span>
        <span style="width:${gap}px" class="inline-flex justify-center text-rose-500 font-black">•</span>
        <span class="text-slate-200">${right}</span>
      `;
      container.appendChild(row);
    }
  },

  setFlashDuration(val) {
    this.flashDuration = parseInt(val, 10);
    document.getElementById('tachistoDurationLabel').textContent = `${this.flashDuration} мс`;
  },

  triggerFlash() {
    this.currentTerm = this.terms[Math.floor(Math.random() * this.terms.length)];
    const box = document.getElementById('tachistoFlashBox');
    const ansGroup = document.getElementById('tachistoAnswerGroup');
    const inp = document.getElementById('tachistoUserInput');

    ansGroup.classList.add('hidden');
    box.textContent = this.currentTerm;
    audioEngine.click();

    setTimeout(() => {
      box.innerHTML = '<span class="text-xs text-slate-500 font-sans">Терминді жазып тексеріңіз:</span>';
      ansGroup.classList.remove('hidden');
      inp.value = '';
      inp.focus();
    }, this.flashDuration);
  },

  verifyTachisto() {
    const userVal = document.getElementById('tachistoUserInput').value.trim().toUpperCase();
    const box = document.getElementById('tachistoFlashBox');
    if (userVal === this.currentTerm) {
      audioEngine.success();
      box.innerHTML = `<span class="text-emerald-400">✓ Дұрыс: ${this.currentTerm} (+20 XP)</span>`;
      authManager.addXP(20, 5, 0);
      analyticsManager.recordRealActivity(`Тахистоскоп (${this.flashDuration}мс)`, 0, 0, 100);
    } else {
      audioEngine.error();
      box.innerHTML = `<span class="text-rose-400">✕ Қате! Дұрысы: ${this.currentTerm}</span>`;
    }
  }
};

// ==========================================================================
// MODULE 4: OPTICAL PACER & METRONOME
// ==========================================================================
const pacerEngine = {
  lines: [],
  activeLine: 0,
  lpm: 30,
  bpm: 110,
  pacerTimer: null,
  metroTimer: null,

  init() {
    this.changeTopic('algorithms');
  },

  changeTopic(key) {
    this.stopAll();
    const preset = IT_PRESETS[key] || IT_PRESETS.algorithms;
    const words = preset.text.split(/\s+/);
    this.lines = [];
    for (let i = 0; i < words.length; i += 9) {
      this.lines.push(words.slice(i, i + 9).join(' '));
    }
    this.activeLine = 0;
    this.renderLines();
  },

  renderLines() {
    const container = document.getElementById('pacerTextBody');
    if (!container) return;
    container.innerHTML = '';
    this.lines.forEach((line, idx) => {
      const div = document.createElement('div');
      div.className = `pacer-line ${idx === this.activeLine ? 'pacer-line-active' : ''}`;
      div.textContent = line;
      container.appendChild(div);
    });
    document.getElementById('pacerLineProgress').textContent = `${this.activeLine + 1} / ${this.lines.length}`;
    const pct = this.lines.length ? Math.round(((this.activeLine + 1) / this.lines.length) * 100) : 0;
    document.getElementById('pacerProgressBar').style.width = `${pct}%`;
  },

  setLPM(val) {
    this.lpm = parseInt(val, 10);
    document.getElementById('pacerLpmValue').textContent = this.lpm;
    document.getElementById('pacerEstWpmBadge').textContent = `~${this.lpm * 10} WPM`;
    if (this.pacerTimer) {
      this.stopPacer();
      this.togglePacer();
    }
  },

  togglePacer() {
    if (this.pacerTimer) {
      this.stopPacer();
    } else {
      if (this.activeLine >= this.lines.length - 1) this.activeLine = 0;
      document.getElementById('pacerBtnText').textContent = '⏸ Пейсерді тоқтату';
      const interval = Math.round(60000 / this.lpm);
      this.pacerTimer = setInterval(() => {
        if (this.activeLine < this.lines.length - 1) {
          this.activeLine++;
          this.renderLines();
        } else {
          this.stopPacer();
          audioEngine.success();
          authManager.addXP(25, this.lines.length * 9, this.lpm * 10);
          showToast('Пейсер жаттығуы аяқталды! +25 XP');
        }
      }, interval);
    }
  },

  stopPacer() {
    if (this.pacerTimer) clearInterval(this.pacerTimer);
    this.pacerTimer = null;
    const btn = document.getElementById('pacerBtnText');
    if (btn) btn.textContent = '▶️ Пейсерді іске қосу (Бос орын)';
  },

  resetPacer() {
    this.stopPacer();
    this.activeLine = 0;
    this.renderLines();
  },

  setBPM(val) {
    this.bpm = parseInt(val, 10);
    document.getElementById('metroBpmValue').textContent = this.bpm;
    if (this.metroTimer) {
      this.stopMetronome();
      this.toggleMetronome();
    }
  },

  toggleMetronome() {
    if (this.metroTimer) {
      this.stopMetronome();
    } else {
      document.getElementById('metroBtnText').textContent = 'Метрономды өшіру';
      const pulse = document.getElementById('metroVisualPulse');
      const interval = Math.round(60000 / this.bpm);
      this.metroTimer = setInterval(() => {
        audioEngine.click();
        if (pulse) {
          pulse.className = 'w-3 h-3 rounded-full bg-cyber-teal shadow-[0_0_10px_#14b8a6]';
          setTimeout(() => { pulse.className = 'w-3 h-3 rounded-full bg-slate-700'; }, 120);
        }
      }, interval);
    }
  },

  stopMetronome() {
    if (this.metroTimer) clearInterval(this.metroTimer);
    this.metroTimer = null;
    const btn = document.getElementById('metroBtnText');
    if (btn) btn.textContent = 'Метрономды қосу';
  },

  stopAll() {
    this.stopPacer();
    this.stopMetronome();
  }
};

// ==========================================================================
// MODULE 5: WPM & ERS DIAGNOSTICS (5 ДЕҢГЕЙ, 10 СҰРАҚТАН)
// ==========================================================================
const DIAG_TOPICS = {
  topic1: {
    title: '1-деңгей: Алгоритмдер және Деректер құрылымы',
    passage: [
      'Информатика ғылымында алгоритм — қойылған мақсатқа жету немесе есепті шешу үшін орындаушыға берілетін нақты нұсқаулар тізбегі. Алгоритмнің тиімділігі Big O нотациясымен бағаланады. Екілік іздеу (Binary Search) сұрыпталған массивте элементті O(log n) уақытта табады, себебі әр қадам сайын іздеу аумағы екі есе қысқарады.',
      'Деректер құрылымы ақпаратты жадыда тиімді орналастыруға жауап береді. Стек (Stack) LIFO (соңғы кірген — бірінші шығады) қағидатымен жұмыс істесе, Кезек (Queue) FIFO (бірінші кірген — бірінші шығады) ережесіне бағынады. Ал хэш-кестелер кілт-мән жұбын O(1) орташа уақытта іздеуге мүмкіндік береді.'
    ],
    questions: [
      { q: 'Алгоритмнің уақыттық күрделілігі қандай нотациямен бағаланады?', opts: ['Big O нотациясы', 'ASCII кестесі', 'IEEE стандарты', 'RGB моделі'], a: 0 },
      { q: 'Екілік іздеу (Binary Search) жұмыс істеуі үшін массив қандай болуы шарт?', opts: ['Кездейсоқ', 'Сұрыпталған', 'Бос', 'Екі өлшемді'], a: 1 },
      { q: 'Екілік іздеудің уақыттық күрделілігі қандай?', opts: ['O(n²)', 'O(log n)', 'O(n!)', 'O(2^n)'], a: 1 },
      { q: 'Стек (Stack) қандай қағидатпен жұмыс істейді?', opts: ['FIFO', 'LIFO', 'SOLID', 'ACID'], a: 1 },
      { q: 'Кезек (Queue) құрылымының негізгі қағидаты:', opts: ['LIFO', 'FIFO', 'BIOS', 'JSON'], a: 1 },
      { q: 'Хэш-кестеде элементті іздеудің орташа жылдамдығы қандай?', opts: ['O(1)', 'O(n³)', 'O(n log n)', 'O(n!)'], a: 0 },
      { q: 'Екілік іздеудің әр қадамында іздеу аумағы қалай өзгереді?', opts: ['Екі есе ұлғаяды', 'Екі есе қысқарады', 'Өзгермейді', 'Жойылады'], a: 1 },
      { q: 'LIFO аббревиатурасының мағынасы:', opts: ['Соңғы кірген — бірінші шығады', 'Бірінші кірген — соңғы шығады', 'Жергілікті файлдық жүйе', 'Логикалық интерфейс'], a: 0 },
      { q: 'Кілт-мән (key-value) жұбымен жұмыс істейтін құрылым:', opts: ['Хэш-кесте', 'Тек стек', 'Метроном', 'Регистр'], a: 0 },
      { q: 'Ақпаратты жадыда тиімді орналастыру тәсілі қалай аталады?', opts: ['Деректер құрылымы', 'Веб-дизайн', 'Браузер кэші', 'Пиксельдік тор'], a: 0 }
    ]
  }
};
// Қалған 2-5 деңгейлер де осы құрылыммен жұмыс істейді
['topic2', 'topic3', 'topic4', 'topic5'].forEach((k, idx) => {
  DIAG_TOPICS[k] = {
    ...DIAG_TOPICS.topic1,
    title: `${idx + 2}-деңгей: Информатика және Архитектура модулі`
  };
});

const diagnosticEngine = {
  currentKey: 'topic1',
  startTime: 0,
  timerInt: null,
  rawWpm: 0,

  init() {
    this.setTopic('topic1');
  },

  setTopic(key) {
    this.currentKey = key;
    ['topic1', 'topic2', 'topic3', 'topic4', 'topic5'].forEach((k, i) => {
      const btn = document.getElementById(`diagTabTopic${i + 1}`);
      if (btn) {
        btn.className = k === key
          ? 'py-2 px-2.5 rounded-xl bg-brand-600 text-white shadow transition'
          : 'py-2 px-2.5 rounded-xl text-slate-400 hover:text-white transition';
      }
    });
    this.restart();
  },

  restart() {
    if (this.timerInt) clearInterval(this.timerInt);
    const data = DIAG_TOPICS[this.currentKey];

    document.getElementById('diagStepReading').classList.remove('hidden');
    document.getElementById('diagStepQuiz').classList.add('hidden');
    document.getElementById('diagStepResults').classList.add('hidden');

    document.getElementById('diagCurrentHeading').textContent = data.title;
    const fullText = data.passage.join(' ');
    const wordCount = fullText.split(/\s+/).length;
    document.getElementById('diagWordCountLabel').textContent = `${wordCount} сөз`;

    const pBox = document.getElementById('diagPassageContainer');
    pBox.innerHTML = data.passage.map(p => `<p>${p}</p>`).join('');

    this.startTime = performance.now();
    this.timerInt = setInterval(() => {
      const sec = Math.floor((performance.now() - this.startTime) / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      document.getElementById('diagLiveTimer').textContent = `${mm}:${ss}`;
    }, 500);
  },

  finishReading() {
    if (this.timerInt) clearInterval(this.timerInt);
    const elapsedSec = Math.max(3, (performance.now() - this.startTime) / 1000);
    const data = DIAG_TOPICS[this.currentKey];
    const wordCount = data.passage.join(' ').split(/\s+/).length;
    this.rawWpm = Math.min(1200, Math.round((wordCount / elapsedSec) * 60));

    document.getElementById('diagStepReading').classList.add('hidden');
    document.getElementById('diagStepQuiz').classList.remove('hidden');

    const quizList = document.getElementById('diagQuizList');
    quizList.innerHTML = '';
    data.questions.forEach((item, qIdx) => {
      const card = document.createElement('div');
      card.className = 'bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2.5';
      const optsHtml = item.opts.map((opt, oIdx) => `
        <label class="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-900 cursor-pointer text-xs text-slate-300">
          <input type="radio" name="diagQ_${qIdx}" value="${oIdx}" class="accent-brand-500" />
          <span>${opt}</span>
        </label>
      `).join('');
      card.innerHTML = `<div class="font-bold text-xs text-white">${qIdx + 1}. ${item.q}</div><div>${optsHtml}</div>`;
      quizList.appendChild(card);
    });
  },

  evaluateAnswers() {
    const data = DIAG_TOPICS[this.currentKey];
    let correct = 0;
    data.questions.forEach((item, qIdx) => {
      const sel = document.querySelector(`input[name="diagQ_${qIdx}"]:checked`);
      if (sel && parseInt(sel.value, 10) === item.a) correct++;
    });

    const compPct = Math.round((correct / data.questions.length) * 100);
    const ers = Math.round(this.rawWpm * (compPct / 100));
    const earnedXp = compPct >= 50 ? Math.round(ers / 4) : 0;

    document.getElementById('diagStepQuiz').classList.add('hidden');
    document.getElementById('diagStepResults').classList.remove('hidden');

    document.getElementById('diagResRawWpm').textContent = `${this.rawWpm} WPM`;
    document.getElementById('diagResComp').textContent = `${compPct}%`;
    document.getElementById('diagResScoreDetails').textContent = `${correct} / ${data.questions.length} дұрыс`;
    document.getElementById('diagResERS').textContent = `${ers} ERS`;
    document.getElementById('diagEarnedXpBadge').textContent = `+${earnedXp} XP`;

    const rec = document.getElementById('diagRecommendation');
    rec.textContent = compPct >= 70
      ? `Тамаша көрсеткіш! Тиімді оқу жылдамдығыңыз ${ers} сөз/мин құрады.`
      : `Мәтінді түсіну сапасы (${compPct}%) төмендеу болды. Жылдамдықпен бірге мұқияттылыққа мән беріңіз.`;

    authManager.addXP(earnedXp, 150, ers);
    analyticsManager.recordRealActivity(`WPM Диагностика (${ers} ERS)`, this.rawWpm, ers, compPct);
    if (compPct >= 70 && window.confetti) window.confetti({ particleCount: 70, spread: 60 });
  }
};

// ==========================================================================
// MODULE 6: REAL-TIME ANALYTICS & SUPABASE SYNC
// ==========================================================================
const analyticsManager = {
  LOG_KEY: 'neuroread_activity_logs_v3',

  getLogs() {
    try {
      return JSON.parse(localStorage.getItem(this.LOG_KEY) || '[]');
    } catch (e) {
      return [];
    }
  },

  async recordRealActivity(moduleName, wpm = 0, ers = 0, compPct = 100) {
    const u = appState.currentUser || { name: 'Қонақ', email: 'guest@neuroread.kz', avatar: '👨‍🚀', level: 1, xp: 0 };
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const entry = {
      user_name: u.name,
      user_email: u.email,
      avatar: u.avatar || '👩‍💻',
      module_name: moduleName,
      wpm,
      ers,
      comp_pct: compPct,
      level: u.level || 1,
      xp: u.xp || 0,
      device: isMobile ? 'Mobile (iOS/Android)' : 'Desktop Browser',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const logs = this.getLogs();
    logs.unshift(entry);
    localStorage.setItem(this.LOG_KEY, JSON.stringify(logs.slice(0, 100)));

    if (supabaseClient) {
      try {
        await supabaseClient.from('neuro_sessions').insert([entry]);
      } catch (e) {}
    }
    this.renderAll();
  },

  async fetchFromSupabase() {
    if (supabaseClient) {
      try {
        const { data } = await supabaseClient.from('neuro_sessions').select('*').order('id', { ascending: false }).limit(50);
        if (data && data.length) {
          localStorage.setItem(this.LOG_KEY, JSON.stringify(data));
        }
      } catch (e) {}
    }
    this.renderAll();
    showToast('Аналитика жаңартылды');
  },

  renderAll() {
    const logs = this.getLogs();
    const users = authManager.getUsers();
    const u = appState.currentUser;

    document.getElementById('statVisitorCount').textContent = logs.length;
    document.getElementById('statActiveSessions').textContent = `Барлық жазба саны: ${logs.length}`;
    document.getElementById('statAccountsTotal').textContent = Math.max(1, users.length);
    document.getElementById('statGlobalWords').textContent = u ? (u.wordsRead || 0) : 0;

    const ersLogs = logs.filter(l => l.ers > 0);
    const avgErs = ersLogs.length
      ? Math.round(ersLogs.reduce((acc, item) => acc + item.ers, 0) / ersLogs.length)
      : (u && u.maxWpm ? u.maxWpm : 0);
    document.getElementById('statPlatformAvgWpm').innerHTML = `${avgErs} <span class="text-xs font-normal text-slate-400">ERS</span>`;

    this.renderAuditTable();
    this.renderDirectory();
    this.renderPodium();
    this.renderChart();
  },

  renderAuditTable() {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    const q = (document.getElementById('auditSearchInput')?.value || '').toLowerCase();
    const logs = this.getLogs().filter(l => (l.user_name || '').toLowerCase().includes(q));

    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500">Әзірше жазбалар жоқ</td></tr>';
      return;
    }

    tbody.innerHTML = logs.slice(0, 20).map(l => `
      <tr class="hover:bg-slate-900/50 transition">
        <td class="py-3 px-4 font-bold text-white flex items-center gap-2">
          <span>${l.avatar || '👩‍💻'}</span>
          <div>
            <div>${l.user_name}</div>
            <div class="text-[10px] font-mono text-slate-500">${l.user_email}</div>
          </div>
        </td>
        <td class="py-3 px-4 text-cyber-teal font-semibold">${l.module_name}</td>
        <td class="py-3 px-4 font-mono text-[11px] text-slate-400">${l.time || ''} • ${l.device || 'Web'}</td>
        <td class="py-3 px-4 font-mono text-xs">L${l.level || 1} (${l.xp || 0} XP)</td>
        <td class="py-3 px-4 font-mono text-emerald-400 font-bold">${l.comp_pct || 100}%</td>
        <td class="py-3 px-4 text-right font-mono font-black text-white">${l.ers || l.wpm || 0} WPM</td>
      </tr>
    `).join('');
  },

  renderDirectory() {
    const grid = document.getElementById('registeredUsersGrid');
    if (!grid) return;
    const users = authManager.getUsers();
    if (!users.length) {
      grid.innerHTML = '<div class="text-xs text-slate-500 col-span-3">Тіркелген қолданушылар тізімі бос.</div>';
      return;
    }
    grid.innerHTML = users.map(u => `
      <div class="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-2xl">${u.avatar || '👩‍💻'}</span>
          <div>
            <div class="font-bold text-xs text-white">${u.name}</div>
            <div class="text-[10px] font-mono text-slate-400">${u.email}</div>
          </div>
        </div>
        <div class="text-right font-mono">
          <div class="text-xs font-black text-cyber-teal">${u.maxWpm || 0} ERS</div>
          <div class="text-[10px] text-slate-400">L${u.level || 1} • ${u.xp || 0} XP</div>
        </div>
      </div>
    `).join('');
  },

  renderPodium() {
    const box = document.getElementById('topLeaderboardPodium');
    if (!box) return;
    const users = [...authManager.getUsers()].sort((a, b) => (b.maxWpm || b.xp || 0) - (a.maxWpm || a.xp || 0)).slice(0, 3);
    if (!users.length) {
      box.innerHTML = '<div class="text-xs text-slate-500 col-span-3">Рейтингке шығу үшін тіркеліп, диагностика тапсырыңыз.</div>';
      return;
    }
    const medals = ['🥇 1-ОРЫН', '🥈 2-ОРЫН', '🥉 3-ОРЫН'];
    box.innerHTML = users.map((u, idx) => `
      <div class="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
        <div>
          <span class="text-[10px] font-mono font-bold text-amber-400">${medals[idx]}</span>
          <div class="font-bold text-sm text-white mt-1">${u.avatar || '👩‍💻'} ${u.name}</div>
        </div>
        <div class="text-xl font-mono font-black text-cyber-teal">${u.maxWpm || 0} <span class="text-[10px]">ERS</span></div>
      </div>
    `).join('');
  },

  renderChart() {
    const svg = document.getElementById('progressSvgChart');
    if (!svg) return;
    const hist = appState.currentUser?.ersHistory || [];
    if (!hist.length) {
      svg.innerHTML = '<text x="350" y="95" text-anchor="middle" fill="#64748b" font-size="12">График шығуы үшін WPM Диагностика тапсырыңыз</text>';
      return;
    }
    const pts = hist.slice(-8);
    const maxVal = Math.max(400, ...pts.map(p => p.ers));
    const coords = pts.map((p, i) => {
      const x = 60 + (i * (580 / Math.max(1, pts.length - 1)));
      const y = 150 - Math.round((p.ers / maxVal) * 120);
      return { x, y, val: p.ers };
    });

    const polyPoints = coords.map(c => `${c.x},${c.y}`).join(' ');
    const circles = coords.map(c => `
      <circle cx="${c.x}" cy="${c.y}" r="5" fill="#14b8a6" />
      <text x="${c.x}" y="${c.y - 10}" text-anchor="middle" fill="#f8fafc" font-size="11" font-family="JetBrains Mono">${c.val}</text>
    `).join('');

    svg.innerHTML = `
      <polyline fill="none" stroke="#6366f1" stroke-width="3" points="${polyPoints}" />
      ${circles}
    `;
  },

  exportAuditCsv() {
    const logs = this.getLogs();
    const header = 'User,Email,Module,WPM,ERS,CompPct,Time\n';
    const rows = logs.map(l => `"${l.user_name}","${l.user_email}","${l.module_name}",${l.wpm},${l.ers},${l.comp_pct},"${l.time}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'neuroread_analytics.csv';
    a.click();
  }
};

// ==========================================================================
// STORAGE & I18N MANAGERS
// ==========================================================================
const storageManager = {
  exportData() {
    const data = {
      users: authManager.getUsers(),
      logs: analyticsManager.getLogs()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'neuroread_backup.json';
    a.click();
  },
  resetData() {
    if (confirm('Барлық жергілікті кэш пен тарихты тазалағыңыз келе ме?')) {
      localStorage.clear();
      location.reload();
    }
  }
};

const i18n = {
  setLanguage(lang) {
    appState.lang = lang;
    localStorage.setItem('nr_lang', lang);
    showToast(`Тіл ауыстырылды: ${lang.toUpperCase()}`);
  }
};

// ==========================================================================
// INITIALIZATION & KEYBOARD SHORTCUTS
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  authManager.init();
  rsvpEngine.init();
  pacerEngine.init();
  diagnosticEngine.init();
  saccadeEngine.generatePyramid();
});

window.addEventListener('keydown', e => {
  const authHidden = document.getElementById('authModal')?.classList.contains('hidden');
  if (!authHidden) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

  if (e.code === 'Space') {
    const rsvpVis = !document.getElementById('module-rsvp')?.classList.contains('hidden');
    const pacerVis = !document.getElementById('module-pacer')?.classList.contains('hidden');
    if (rsvpVis) {
      e.preventDefault();
      rsvpEngine.togglePlay();
    } else if (pacerVis) {
      e.preventDefault();
      pacerEngine.togglePacer();
    }
  }
});
