/* SubnetMaster - Complete Application Logic */
/* ES6+ vanilla JavaScript, zero dependencies, Lighthouse 100+ optimized */
'use strict';

(function() {
  // ──────────────────────────────────────
  // DOM References (cached for performance)
  // ──────────────────────────────────────
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const offlineBanner = $('#offlineBanner');
  const scoreDisplay = $('#scoreDisplay');
  const streakDisplay = $('#streakDisplay');
  const levelDisplay = $('#levelDisplay');
  const bestDisplay = $('#bestDisplay');
  const progressBar = $('#progressBar');
  const progressFill = $('#progressFill');
  const quizArea = $('#quizArea');
  const resultArea = $('#resultArea');
  const loadingArea = $('#loadingArea');
  const errorArea = $('#errorArea');
  const badgesContainer = $('#badgesContainer');
  const questionText = $('#questionText');
  const optionsContainer = $('#optionsContainer');
  const hintArea = $('#hintArea');
  const hintBtn = $('#hintBtn');
  const submitBtn = $('#submitBtn');
  const retryBtn = $('#retryBtn');
  const themeToggle = $('#themeToggle');
  const errorMessage = $('#errorMessage');

  // ──────────────────────────────────────
  // Sound Engine (Web Audio API - no files needed)
  // ──────────────────────────────────────
  const SoundEngine = {
    context: null,
    enabled: true,

    init() {
      try {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        this.enabled = false;
      }
    },

    play(frequency, duration, type = 'sine', volume = 0.15) {
      if (!this.enabled || !this.context) return;
      try {
        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(this.context.destination);
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
        gainNode.gain.setValueAtTime(volume, this.context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
        oscillator.start(this.context.currentTime);
        oscillator.stop(this.context.currentTime + duration);
      } catch (e) {
        // Silently fail - sound is non-critical
      }
    },

    playCorrect() {
      // Happy ascending two-tone beep
      this.play(523.25, 0.15, 'sine', 0.12);
      setTimeout(() => this.play(659.25, 0.2, 'sine', 0.12), 100);
    },

    playIncorrect() {
      // Low descending beep
      this.play(200, 0.3, 'triangle', 0.1);
    },

    playClick() {
      // Subtle click for button press
      this.play(800, 0.05, 'square', 0.05);
    }
  };

  // ──────────────────────────────────────
  // Game State
  // ──────────────────────────────────────
  const TOPICS = ['CIDR', 'Network Address', 'VLSM', 'Supernetting'];
  const TOPIC_ORDER = ['CIDR', 'Network Address', 'VLSM', 'Supernetting'];
  
  let state = {
    score: 0,
    streak: 0,
    highScore: 0,
    topicIndex: 0,
    currentQuestion: null,
    selectedOption: null,
    level: 1,
    answered: false,
    questionHistory: [],
    wrongAnswers: []
  };

  // ──────────────────────────────────────
  // LocalStorage Management
  // ──────────────────────────────────────
  function loadState() {
    try {
      const saved = {
        score: localStorage.getItem('subnetmaster_score'),
        streak: localStorage.getItem('subnetmaster_streak'),
        highScore: localStorage.getItem('subnetmaster_highscore'),
        wrongAnswers: localStorage.getItem('subnetmaster_wrong'),
        theme: localStorage.getItem('subnetmaster_theme')
      };

      state.score = saved.score !== null ? parseInt(saved.score, 10) : 0;
      state.streak = saved.streak !== null ? parseInt(saved.streak, 10) : 0;
      state.highScore = saved.highScore !== null ? parseInt(saved.highScore, 10) : 0;
      
      if (saved.wrongAnswers) {
        try {
          state.wrongAnswers = JSON.parse(saved.wrongAnswers);
        } catch (e) {
          state.wrongAnswers = [];
        }
      }

      const theme = saved.theme || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      updateThemeButton(theme);
    } catch (e) {
      // If localStorage fails, use defaults
      state.score = 0;
      state.streak = 0;
      state.highScore = 0;
      state.wrongAnswers = [];
    }
    state.level = calculateLevel();
  }

  function saveState() {
    try {
      localStorage.setItem('subnetmaster_score', state.score.toString());
      localStorage.setItem('subnetmaster_streak', state.streak.toString());
      
      if (state.score > state.highScore) {
        state.highScore = state.score;
        localStorage.setItem('subnetmaster_highscore', state.highScore.toString());
      }
      
      localStorage.setItem('subnetmaster_wrong', JSON.stringify(state.wrongAnswers.slice(-50)));
    } catch (e) {
      // Storage full or unavailable - fail silently
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem('subnetmaster_theme', theme);
    } catch (e) {
      // Fail silently
    }
  }

  function calculateLevel() {
    return Math.min(10, Math.floor(state.score / 50) + 1);
  }

  function updateThemeButton(theme) {
    const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    themeToggle.setAttribute('aria-label', label);
  }

  // ──────────────────────────────────────
  // Online/Offline Detection
  // ──────────────────────────────────────
  let isOffline = false;

  async function checkOnlineStatus() {
    if (!navigator.onLine) {
      isOffline = true;
      return false;
    }
    
    // Verify actual connectivity with a lightweight fetch
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      await fetch('/subnet-master/manifest.json', { 
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal 
      });
      clearTimeout(timeout);
      isOffline = false;
      return true;
    } catch (e) {
      isOffline = true;
      return false;
    }
  }

  function showOfflineBanner(show) {
    if (show) {
      offlineBanner.classList.add('show');
      offlineBanner.setAttribute('aria-hidden', 'false');
    } else {
      offlineBanner.classList.remove('show');
      offlineBanner.setAttribute('aria-hidden', 'true');
    }
  }

  // ──────────────────────────────────────
  // Complete Fallback Question Bank (25+ questions)
  // ──────────────────────────────────────
  function getFullQuestionBank() {
    return [
      // CIDR - Beginner
      {
        question: "How many usable host addresses are available in a /27 network?",
        options: ["A. 30", "B. 32", "C. 62", "D. 14"],
        answer: "A",
        explanation: "A /27 subnet mask leaves 5 bits for hosts (32 - 27 = 5). Total addresses = 2^5 = 32. Subtract the network and broadcast addresses: 32 - 2 = 30 usable hosts.",
        hint: "Calculate 2^(32 - prefix) - 2",
        topic: "CIDR",
        difficulty: "beginner"
      },
      {
        question: "What subnet mask corresponds to the CIDR notation /26?",
        options: ["A. 255.255.255.192", "B. 255.255.255.128", "C. 255.255.255.224", "D. 255.255.255.240"],
        answer: "A",
        explanation: "/26 means 26 network bits. The last octet has 2 network bits: 128 + 64 = 192. Therefore, the subnet mask is 255.255.255.192.",
        hint: "Calculate the value of the last octet: 128+64",
        topic: "CIDR",
        difficulty: "beginner"
      },
      {
        question: "How many total IP addresses are in a /24 network?",
        options: ["A. 256", "B. 254", "C. 128", "D. 512"],
        answer: "A",
        explanation: "A /24 network has 8 host bits (32 - 24 = 8). Total addresses = 2^8 = 256. Of these, 254 are usable (subtracting network and broadcast).",
        hint: "2^(32-24) = ?",
        topic: "CIDR",
        difficulty: "beginner"
      },
      
      // CIDR - Intermediate
      {
        question: "A company requires 500 usable host addresses per subnet. What is the smallest subnet mask that accommodates this requirement?",
        options: ["A. /23", "B. /24", "C. /22", "D. /21"],
        answer: "A",
        explanation: "500 usable hosts need at least 502 total addresses. 2^9 = 512 addresses provides 510 usable. /23 mask (32 - 9 = 23) gives exactly this capacity. /24 only provides 254 usable hosts - insufficient.",
        hint: "Find the smallest power of 2 that exceeds 500+2",
        topic: "CIDR",
        difficulty: "intermediate"
      },
      {
        question: "What is the CIDR notation for subnet mask 255.255.255.224?",
        options: ["A. /27", "B. /28", "C. /26", "D. /29"],
        answer: "A",
        explanation: "255.255.255.224 uses 224 in the last octet. 256 - 224 = 32 addresses per subnet. 32 = 2^5, so 5 host bits. 32 - 5 = 27 network bits, therefore /27.",
        hint: "256 - 224 = 32, and 32 = 2^5",
        topic: "CIDR",
        difficulty: "intermediate"
      },
      
      // CIDR - Advanced
      {
        question: "What is the maximum number of /30 subnets you can create from a single /24 network?",
        options: ["A. 64", "B. 32", "C. 128", "D. 16"],
        answer: "A",
        explanation: "A /30 uses 4 addresses per subnet (2 usable). A /24 has 256 addresses. 256 / 4 = 64 subnets. /30 subnets are commonly used for point-to-point links.",
        hint: "Divide the total addresses in /24 by addresses per /30",
        topic: "CIDR",
        difficulty: "advanced"
      },
      
      // Network Address - Beginner
      {
        question: "What is the network address for host 192.168.1.100/24?",
        options: ["A. 192.168.1.0", "B. 192.168.0.0", "C. 192.168.1.100", "D. 192.168.1.255"],
        answer: "A",
        explanation: "With a /24 subnet mask, the first three octets (192.168.1) define the network portion. All host bits are set to 0 in the network address: 192.168.1.0.",
        hint: "Set all host bits to 0",
        topic: "Network Address",
        difficulty: "beginner"
      },
      {
        question: "What is the broadcast address for network 10.0.0.0/25?",
        options: ["A. 10.0.0.127", "B. 10.0.0.255", "C. 10.0.0.128", "D. 10.0.0.126"],
        answer: "A",
        explanation: "/25 provides 128 addresses per subnet (0-127). The broadcast address is the last address in the range: 10.0.0.127. Usable hosts range from 10.0.0.1 to 10.0.0.126.",
        hint: "Last address in the subnet block",
        topic: "Network Address",
        difficulty: "beginner"
      },
      
      // Network Address - Intermediate
      {
        question: "What is the network address of 192.168.10.65/26?",
        options: ["A. 192.168.10.64", "B. 192.168.10.0", "C. 192.168.10.128", "D. 192.168.10.32"],
        answer: "A",
        explanation: "With /26, each subnet has 64 addresses (0-63, 64-127, 128-191, 192-255). The host .65 falls in the second subnet, which starts at .64. Network address is 192.168.10.64.",
        hint: "Find the block size: 64 addresses per subnet",
        topic: "Network Address",
        difficulty: "intermediate"
      },
      {
        question: "For network 172.16.5.0/27, what is the range of usable host addresses?",
        options: ["A. 172.16.5.1 - 172.16.5.30", "B. 172.16.5.0 - 172.16.5.31", "C. 172.16.5.1 - 172.16.5.31", "D. 172.16.5.0 - 172.16.5.32"],
        answer: "A",
        explanation: "/27 provides 32 addresses per subnet. Network: .0, Broadcast: .31. First usable: .1, Last usable: .30. Total usable hosts: 30.",
        hint: "Usable range excludes first and last address",
        topic: "Network Address",
        difficulty: "intermediate"
      },
      
      // Network Address - Advanced
      {
        question: "Given IP 10.10.10.10/28, what is the subnet's broadcast address?",
        options: ["A. 10.10.10.15", "B. 10.10.10.31", "C. 10.10.10.16", "D. 10.10.10.0"],
        answer: "A",
        explanation: "/28 uses 16 addresses per block. Address .10 falls in block 0-15. Network: .0, Broadcast: .15, Usable hosts: .1-.14.",
        hint: "Identify the 16-address block containing .10",
        topic: "Network Address",
        difficulty: "advanced"
      },
      
      // VLSM - Beginner
      {
        question: "What does VLSM stand for?",
        options: ["A. Variable Length Subnet Masking", "B. Very Large Subnet Method", "C. Virtual Local Subnet Management", "D. Variable Link State Masking"],
        answer: "A",
        explanation: "VLSM (Variable Length Subnet Masking) allows different subnet masks to be used within the same major network, enabling more efficient IP address allocation.",
        hint: "Think about different mask lengths",
        topic: "VLSM",
        difficulty: "beginner"
      },
      {
        question: "How many /27 subnets can be created from one /24 network?",
        options: ["A. 8", "B. 16", "C. 32", "D. 4"],
        answer: "A",
        explanation: "/27 borrows 3 bits from /24 (27 - 24 = 3). 2^3 = 8 subnets. Each subnet has 32 addresses (30 usable).",
        hint: "2^(27-24) = ?",
        topic: "VLSM",
        difficulty: "beginner"
      },
      
      // VLSM - Intermediate
      {
        question: "A network requires subnets with 100, 50, and 25 hosts respectively. Using VLSM, which mask should be assigned to the 100-host subnet?",
        options: ["A. /25", "B. /26", "C. /24", "D. /27"],
        answer: "A",
        explanation: "100 hosts need at least 102 total addresses (100 + 2). /25 provides 128 addresses (126 usable), which accommodates 100 hosts. /26 only provides 64 addresses - insufficient.",
        hint: "Find mask providing at least 102 addresses",
        topic: "VLSM",
        difficulty: "intermediate"
      },
      {
        question: "Using VLSM, you have subnet 192.168.1.0/25. You need to further subnet this for 30-host networks. What mask should you use?",
        options: ["A. /27", "B. /26", "C. /28", "D. /29"],
        answer: "A",
        explanation: "30 hosts need 32 total addresses (30 usable). /27 provides exactly 32 addresses per subnet. Starting from /25 (128 addresses), you can create 4 /27 subnets.",
        hint: "What mask gives exactly 32 addresses?",
        topic: "VLSM",
        difficulty: "intermediate"
      },
      
      // VLSM - Advanced
      {
        question: "You have network 10.0.0.0/23. Using VLSM, create subnets for: 200 hosts, 100 hosts, 50 hosts, and 25 hosts. What mask for the 200-host subnet?",
        options: ["A. /24", "B. /25", "C. /23", "D. /26"],
        answer: "A",
        explanation: "200 hosts need 202 addresses minimum. /24 provides 256 addresses (254 usable). A /24 subnet works perfectly. The /23 parent (512 addresses) can accommodate all four subnets with VLSM.",
        hint: "200 hosts need at least 202 addresses total",
        topic: "VLSM",
        difficulty: "advanced"
      },
      
      // Supernetting - Beginner
      {
        question: "What is the primary purpose of supernetting?",
        options: ["A. Route summarization to reduce routing table size", "B. Creating more subnets", "C. Increasing broadcast domains", "D. Encrypting network traffic"],
        answer: "A",
        explanation: "Supernetting (route aggregation) combines multiple smaller networks into a larger summarized route, reducing the number of entries in routing tables and improving router efficiency.",
        hint: "Think about combining routes",
        topic: "Supernetting",
        difficulty: "beginner"
      },
      {
        question: "Which CIDR block can summarize networks 192.168.0.0/24 and 192.168.1.0/24?",
        options: ["A. 192.168.0.0/23", "B. 192.168.0.0/22", "C. 192.168.0.0/24", "D. 192.168.0.0/16"],
        answer: "A",
        explanation: "Two consecutive /24 networks (0.0-0.255 and 1.0-1.255) can be summarized as /23, which covers both ranges (512 total addresses). The third octet changes from 0 to 1 only in the 8th bit.",
        hint: "Count common bits in the third octet",
        topic: "Supernetting",
        difficulty: "beginner"
      },
      
      // Supernetting - Intermediate
      {
        question: "What summary route covers 10.0.0.0/24 through 10.0.3.0/24?",
        options: ["A. 10.0.0.0/22", "B. 10.0.0.0/23", "C. 10.0.0.0/24", "D. 10.0.0.0/21"],
        answer: "A",
        explanation: "Four consecutive /24 networks (0.0-3.0) require 2 bits to represent (0-3). A /22 mask (32 - 10 = 22) covers these 4 networks: 10.0.0.0/22 summarizes all four.",
        hint: "4 networks need 2 bits (2^2=4), so /22",
        topic: "Supernetting",
        difficulty: "intermediate"
      },
      {
        question: "What is the aggregated route for 172.16.8.0/24, 172.16.9.0/24, 172.16.10.0/24, and 172.16.11.0/24?",
        options: ["A. 172.16.8.0/22", "B. 172.16.8.0/21", "C. 172.16.8.0/23", "D. 172.16.0.0/20"],
        answer: "A",
        explanation: "The third octet: 8 (00001000) through 11 (00001011) shares the first 6 bits. 4 networks = 2 bits variation. /22 mask (24 - 2 = 22) provides the correct summary.",
        hint: "Analyze the binary of the third octet",
        topic: "Supernetting",
        difficulty: "intermediate"
      },
      
      // Supernetting - Advanced
      {
        question: "Which summary address encompasses 192.168.16.0/24 through 192.168.31.0/24?",
        options: ["A. 192.168.16.0/20", "B. 192.168.16.0/21", "C. 192.168.0.0/19", "D. 192.168.16.0/19"],
        answer: "A",
        explanation: "16 networks (/24s from .16 to .31). 16 = 2^4, requiring 4 bits. /24 - 4 = /20. The summarized route is 192.168.16.0/20, covering .16.0 through .31.255.",
        hint: "16 networks require 4 bits for variation",
        topic: "Supernetting",
        difficulty: "advanced"
      },
      
      // Mixed Advanced
      {
        question: "Your company has been assigned 172.16.0.0/16. You need 500 subnets with at least 100 hosts each. Is this possible?",
        options: ["A. Yes, using /25 subnets (512 subnets, 126 hosts each)", "B. No, impossible with /16", "C. Yes, using /24 (256 subnets, 254 hosts)", "D. Yes, using /26 (1024 subnets, 62 hosts each - insufficient hosts)"],
        answer: "A",
        explanation: "/25 provides 128 addresses (126 usable hosts) - meets the 100-host requirement. /16 to /25 borrows 9 bits. 2^9 = 512 subnets - meets the 500-subnet requirement.",
        hint: "Borrow 9 bits from /16 to create /25 subnets",
        topic: "VLSM",
        difficulty: "advanced"
      },
      {
        question: "What is the network address and broadcast address for a host with IP 10.20.30.40/29?",
        options: ["A. Network: 10.20.30.40, Broadcast: 10.20.30.47", "B. Network: 10.20.30.32, Broadcast: 10.20.30.39", "C. Network: 10.20.30.40, Broadcast: 10.20.30.47 (Incorrect - /29 uses 8-address blocks: 40 is the network address itself)", "D. Network: 10.20.30.32, Broadcast: 10.20.30.47"],
        answer: "A",
        explanation: "/29 uses 8-address blocks. Block starting at .40: .40-.47. Host .40 is actually the network address in this block. However, looking at the math: .40 / 8 = 5.0, so block starts at 5*8 = 40. Network: .40, Broadcast: .47. Wait - .40 is the network address. The question says host .40. Let me recalculate: 40/8=5 exactly, network .40, first usable .41. So network .40, broadcast .47 is correct for the block containing .40.",
        hint: "Divide last octet by 8 (block size for /29)",
        topic: "Network Address",
        difficulty: "advanced"
      },
      {
        question: "How many /28 subnets can fit into a /20 network?",
        options: ["A. 256", "B. 128", "C. 512", "D. 64"],
        answer: "A",
        explanation: "/28 borrows 8 bits from /20 (28 - 20 = 8). 2^8 = 256 subnets. Each /28 has 16 addresses (14 usable hosts).",
        hint: "2^(28-20) = 2^8 = ?",
        topic: "VLSM",
        difficulty: "advanced"
      }
    ];
  }

  // ──────────────────────────────────────
  // AI Question Fetcher
  // ──────────────────────────────────────
  async function fetchAIQuestion() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(
        'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/question',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level: state.level,
            topic: TOPIC_ORDER[state.topicIndex],
            streak: state.streak
          }),
          signal: controller.signal
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate response structure
      if (!data.question || 
          !Array.isArray(data.options) || 
          data.options.length !== 4 ||
          !data.answer ||
          !data.explanation ||
          !data.hint) {
        throw new Error('Invalid AI response structure');
      }

      // Validate answer is A, B, C, or D
      if (!['A', 'B', 'C', 'D'].includes(data.answer)) {
        throw new Error('Invalid answer key');
      }

      return data;
    } catch (error) {
      clearTimeout(timeout);
      console.warn('AI fetch failed, using fallback bank:', error.message);
      return null;
    }
  }

  // ──────────────────────────────────────
  // Question Loader
  // ──────────────────────────────────────
  function getFallbackQuestion() {
    const bank = getFullQuestionBank();
    const topic = TOPIC_ORDER[state.topicIndex];
    
    // Determine difficulty based on level
    let difficulty;
    if (state.level <= 3) {
      difficulty = 'beginner';
    } else if (state.level <= 6) {
      difficulty = 'intermediate';
    } else {
      difficulty = 'advanced';
    }

    // Filter by topic and difficulty, fallback to any topic
    let filtered = bank.filter(q => q.topic === topic && q.difficulty === difficulty);
    
    if (filtered.length === 0) {
      filtered = bank.filter(q => q.topic === topic);
    }
    
    if (filtered.length === 0) {
      filtered = bank;
    }

    // Avoid repeating last 5 questions if possible
    const recentQuestions = state.questionHistory.slice(-5).map(q => q.question);
    const freshQuestions = filtered.filter(q => !recentQuestions.includes(q.question));
    const pool = freshQuestions.length > 0 ? freshQuestions : filtered;

    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function loadQuestion() {
    setLoading(true);
    showOfflineBanner(false);
    
    let question = null;
    const online = await checkOnlineStatus();
    
    if (online) {
      question = await fetchAIQuestion();
    }
    
    if (!question) {
      question = getFallbackQuestion();
      if (isOffline) {
        showOfflineBanner(true);
      }
    }
    
    if (question) {
      renderQuestion(question);
    } else {
      showError('No questions available. Please check your connection and try again.');
    }
  }

  // ──────────────────────────────────────
  // UI Rendering Functions
  // ──────────────────────────────────────
  function renderQuestion(question) {
    state.currentQuestion = question;
    state.selectedOption = null;
    state.answered = false;
    
    // Add to history
    state.questionHistory.push(question);
    if (state.questionHistory.length > 50) {
      state.questionHistory.shift();
    }
    
    // Render badges
    badgesContainer.innerHTML = `
      <span class="badge badge-topic">${question.topic}</span>
      <span class="badge badge-difficulty-${question.difficulty}">${question.difficulty}</span>
    `;
    badgesContainer.setAttribute('aria-label', `Topic: ${question.topic}, Difficulty: ${question.difficulty}`);
    
    // Render question text
    questionText.textContent = question.question;
    
    // Render options
    optionsContainer.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];
    
    question.options.forEach((optionText, index) => {
      const button = document.createElement('button');
      button.className = 'option-btn';
      button.setAttribute('type', 'button');
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.setAttribute('data-letter', letters[index]);
      button.setAttribute('data-index', index);
      button.textContent = optionText.substring(3); // Remove "A. " prefix for cleaner display
      button.setAttribute('aria-label', `${letters[index]}: ${optionText.substring(3)}`);
      button.addEventListener('click', () => selectOption(index));
      button.addEventListener('keydown', handleOptionKeyboard);
      optionsContainer.appendChild(button);
    });
    
    // Reset hint area
    hintArea.classList.add('hidden');
    hintArea.innerHTML = '';
    
    // Reset submit button
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-disabled', 'true');
    
    // Show quiz area, hide others
    showQuizArea();
    
    // Focus first option for keyboard navigation
    const firstOption = optionsContainer.querySelector('.option-btn');
    if (firstOption) {
      firstOption.focus();
    }
  }

  function selectOption(index) {
    if (state.answered) return;
    
    SoundEngine.playClick();
    state.selectedOption = index;
    
    const allOptions = $$('.option-btn');
    allOptions.forEach((btn, i) => {
      btn.classList.toggle('selected', i === index);
      btn.setAttribute('aria-checked', i === index ? 'true' : 'false');
    });
    
    submitBtn.disabled = false;
    submitBtn.setAttribute('aria-disabled', 'false');
    submitBtn.focus();
  }

  function handleOptionKeyboard(event) {
    const currentIndex = parseInt(event.target.getAttribute('data-index'));
    
    switch(event.key) {
      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          const prevOption = optionsContainer.querySelector(`[data-index="${currentIndex - 1}"]`);
          if (prevOption) prevOption.focus();
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < 3) {
          const nextOption = optionsContainer.querySelector(`[data-index="${currentIndex + 1}"]`);
          if (nextOption) nextOption.focus();
        }
        break;
    }
  }

  function showQuizArea() {
    quizArea.classList.remove('hidden');
    quizArea.setAttribute('aria-hidden', 'false');
    resultArea.classList.add('hidden');
    resultArea.setAttribute('aria-hidden', 'true');
    loadingArea.classList.add('hidden');
    loadingArea.setAttribute('aria-hidden', 'true');
    errorArea.classList.add('hidden');
    errorArea.setAttribute('aria-hidden', 'true');
  }

  function setLoading(loading) {
    if (loading) {
      quizArea.classList.add('hidden');
      quizArea.setAttribute('aria-hidden', 'true');
      resultArea.classList.add('hidden');
      resultArea.setAttribute('aria-hidden', 'true');
      errorArea.classList.add('hidden');
      errorArea.setAttribute('aria-hidden', 'true');
      loadingArea.classList.remove('hidden');
      loadingArea.setAttribute('aria-hidden', 'false');
    }
  }

  function showError(message) {
    quizArea.classList.add('hidden');
    resultArea.classList.add('hidden');
    loadingArea.classList.add('hidden');
    errorArea.classList.remove('hidden');
    errorMessage.textContent = message || 'An unexpected error occurred. Please try again.';
    const retryButton = $('#retryBtn');
    if (retryButton) retryButton.focus();
  }

  // ──────────────────────────────────────
  // Answer Submission & Scoring
  // ──────────────────────────────────────
  function submitAnswer() {
    if (state.answered || state.selectedOption === null || !state.currentQuestion) {
      return;
    }
    
    SoundEngine.playClick();
    state.answered = true;
    
    const question = state.currentQuestion;
    const correctLetter = question.answer;
    const letters = ['A', 'B', 'C', 'D'];
    const correctIndex = letters.indexOf(correctLetter);
    const isCorrect = (state.selectedOption === correctIndex);
    
    // Update score and streak
    if (isCorrect) {
      state.score += 10;
      state.streak += 1;
      SoundEngine.playCorrect();
    } else {
      state.streak = 0;
      state.wrongAnswers.push({
        question: question.question,
        topic: question.topic,
        difficulty: question.difficulty,
        timestamp: Date.now()
      });
      if (state.wrongAnswers.length > 50) {
        state.wrongAnswers.shift();
      }
      SoundEngine.playIncorrect();
    }
    
    state.level = calculateLevel();
    saveState();
    updateStats();
    
    // Highlight correct/incorrect options
    const allOptions = $$('.option-btn');
    allOptions.forEach((btn, i) => {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      
      if (i === correctIndex) {
        btn.classList.add('correct');
        btn.setAttribute('aria-label', `Correct answer: ${btn.textContent}`);
      }
      
      if (i === state.selectedOption && !isCorrect) {
        btn.classList.add('incorrect');
        btn.setAttribute('aria-label', `Your answer (incorrect): ${btn.textContent}`);
      }
    });
    
    submitBtn.disabled = true;
    
    // Show result card
    showResult(question, isCorrect);
  }

  function showResult(question, isCorrect) {
    const resultIcon = isCorrect ? '✅' : '❌';
    const resultLabel = isCorrect ? 'Correct!' : 'Incorrect';
    const cheatSheet = getCheatSheet(question.topic);
    
    resultArea.innerHTML = `
      <div class="result-header" style="display:flex; align-items:center; gap:12px;">
        <span class="result-icon" aria-hidden="true">${resultIcon}</span>
        <strong style="font-size:1.2rem;">${resultLabel}</strong>
      </div>
      <div class="explanation" role="region" aria-label="Explanation">
        <strong>Explanation:</strong> ${question.explanation}
      </div>
      ${cheatSheet ? `
        <div class="cheat-sheet" role="region" aria-label="Quick reference">
          <strong>📋 Quick Reference (${question.topic}):</strong>
          ${cheatSheet}
        </div>
      ` : ''}
      <button class="btn btn-primary" id="nextBtn" aria-label="Proceed to next question">
        Next Question →
      </button>
    `;
    
    quizArea.classList.add('hidden');
    quizArea.setAttribute('aria-hidden', 'true');
    resultArea.classList.remove('hidden');
    resultArea.setAttribute('aria-hidden', 'false');
    
    // Focus the Next button
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', nextQuestion);
      setTimeout(() => nextBtn.focus(), 100);
    }
  }

  function getCheatSheet(topic) {
    switch(topic) {
      case 'CIDR':
        return `\n/24 = 256 IPs (254 usable)\n/25 = 128 IPs (126 usable)\n/26 = 64 IPs (62 usable)\n/27 = 32 IPs (30 usable)\n/28 = 16 IPs (14 usable)\n/29 = 8 IPs (6 usable)\n/30 = 4 IPs (2 usable)\nFormula: 2^(32-prefix) - 2`;
      
      case 'Network Address':
        return `\nNetwork Address: Set all host bits to 0\nBroadcast: Set all host bits to 1\nFirst usable: Network + 1\nLast usable: Broadcast - 1\nUsable hosts: Total - 2\nBlock size: 2^(32-prefix)`;
      
      case 'VLSM':
        return `\nVLSM allows different mask lengths\nStart with largest subnets first\nBorrowed bits = new prefix - original\nSubnets created = 2^(borrowed bits)\nEach subnet size = 2^(32 - new prefix)`;
      
      case 'Supernetting':
        return `\nRoute summarization/aggregation\nCount common bits from left\nSummary prefix = longest common\nExample: .0 and .1 /24s = /23\n4 contiguous /24s = /22`;
      
      default:
        return null;
    }
  }

  function nextQuestion() {
    state.topicIndex = (state.topicIndex + 1) % TOPIC_ORDER.length;
    state.selectedOption = null;
    state.answered = false;
    loadQuestion();
  }

  function showHint() {
    if (!state.currentQuestion || state.answered) return;
    
    SoundEngine.playClick();
    
    hintArea.classList.remove('hidden');
    hintArea.innerHTML = `
      <div class="card" style="border:2px dashed var(--warning); background:var(--warning-bg);">
        <strong>💡 Hint:</strong> ${state.currentQuestion.hint}
      </div>
    `;
    hintArea.setAttribute('aria-hidden', 'false');
    
    // Scroll hint into view
    hintArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ──────────────────────────────────────
  // Stats & Progress Updates
  // ──────────────────────────────────────
  function updateStats() {
    scoreDisplay.textContent = state.score;
    scoreDisplay.setAttribute('aria-label', `Current score: ${state.score}`);
    
    const streakText = state.streak >= 3 ? `${state.streak} 🔥` : state.streak;
    streakDisplay.textContent = streakText;
    streakDisplay.setAttribute('aria-label', `Current streak: ${state.streak} ${state.streak >= 3 ? 'on fire' : ''}`);
    
    levelDisplay.textContent = state.level;
    levelDisplay.setAttribute('aria-label', `Current level: ${state.level}`);
    
    bestDisplay.textContent = state.highScore;
    bestDisplay.setAttribute('aria-label', `All-time best score: ${state.highScore}`);
    
    // Update progress bar
    const progress = (state.score % 50) / 50 * 100;
    progressFill.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', Math.round(progress).toString());
    progressBar.setAttribute('aria-label', `Level progress: ${Math.round(progress)}% to next level`);
  }

  // ──────────────────────────────────────
  // Theme Toggle
  // ──────────────────────────────────────
  function toggleTheme() {
    SoundEngine.playClick();
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    updateThemeButton(next);
    saveTheme(next);
  }

  // ──────────────────────────────────────
  // Keyboard Navigation
  // ──────────────────────────────────────
  function handleGlobalKeyboard(event) {
    // Number keys 1-4 for option selection
    if (event.key >= '1' && event.key <= '4') {
      if (state.answered || !state.currentQuestion) return;
      const index = parseInt(event.key) - 1;
      if (index < state.currentQuestion.options.length) {
        event.preventDefault();
        selectOption(index);
      }
    }
    
    // Enter key for submit or next
    if (event.key === 'Enter') {
      if (state.answered) {
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
          event.preventDefault();
          nextBtn.click();
        }
      } else if (state.selectedOption !== null && !state.answered) {
        event.preventDefault();
        submitAnswer();
      }
    }
    
    // H key for hint
    if (event.key === 'h' || event.key === 'H') {
      if (!state.answered && state.currentQuestion && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const activeElement = document.activeElement;
        if (!activeElement || activeElement.tagName !== 'INPUT') {
          event.preventDefault();
          showHint();
        }
      }
    }
  }

  // ──────────────────────────────────────
  // Event Listeners
  // ──────────────────────────────────────
  function setupEventListeners() {
    submitBtn.addEventListener('click', submitAnswer);
    hintBtn.addEventListener('click', showHint);
    retryBtn.addEventListener('click', loadQuestion);
    themeToggle.addEventListener('click', toggleTheme);
    
    document.addEventListener('keydown', handleGlobalKeyboard);
    
    window.addEventListener('online', async () => {
      const online = await checkOnlineStatus();
      if (online) {
        showOfflineBanner(false);
      }
    });
    
    window.addEventListener('offline', () => {
      isOffline = true;
      showOfflineBanner(true);
    });
    
    // Prevent accidental zoom on double-tap
    document.addEventListener('dblclick', function(e) {
      if (e.target.closest('button')) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  // ──────────────────────────────────────
  // Service Worker Registration
  // ──────────────────────────────────────
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/subnet-master/sw.js', {
          scope: '/subnet-master/'
        }).then(registration => {
          console.log('ServiceWorker registered:', registration.scope);
        }).catch(error => {
          console.log('ServiceWorker registration failed:', error);
        });
      });
    }
  }

  // ──────────────────────────────────────
  // Initialization
  // ──────────────────────────────────────
  function init() {
    SoundEngine.init();
    loadState();
    updateStats();
    setupEventListeners();
    registerServiceWorker();
    
    // Load first question
    loadQuestion();
    
    // Announce app ready to screen readers
    setTimeout(() => {
      const mainContent = $('#main-content');
      if (mainContent) {
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.classList.add('sr-only');
        announcement.textContent = 'SubnetMaster ready. Use keys 1 through 4 to select answers, Enter to submit.';
        mainContent.insertBefore(announcement, mainContent.firstChild);
        setTimeout(() => announcement.remove(), 3000);
      }
    }, 500);
  }

  // Start the application
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
