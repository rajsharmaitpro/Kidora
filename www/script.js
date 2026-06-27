// ================= SOUND =================
const correctSound = new Audio("./assets/sounds/correct.mp3");
const wrongSound = new Audio("./assets/sounds/wrong.mp3");
const winSound = new Audio("./assets/sounds/win.mp3");

// ================= VOICE SYNTHESIZER =================
const synth = window.speechSynthesis;
let voiceReady = false;
let voices = [];
let TextToSpeech;

if (window.Capacitor) {
    TextToSpeech = window.Capacitor?.Plugins?.TextToSpeech;
}

function loadVoices() {

    if (!window.speechSynthesis) {
        return;
    }

    voices = window.speechSynthesis.getVoices();
}


if (window.speechSynthesis) {
    loadVoices();

    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
}

async function speak(text, lang) {
    // Android Capacitor app
    if (window.Capacitor && TextToSpeech) {
        await TextToSpeech.speak({
            text: text,
            lang: lang || "en-IN",
            rate: 0.85,
            pitch: 1.0,
            volume: 1.0
        });

    }
    // Normal web browser
    else if ('speechSynthesis' in window) {

        if (!synth) return;
        synth.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = lang || "en-IN";
        utt.rate = 0.85;
        utt.pitch = 1.1;
        // Prefer a female/child-friendly voice
        const preferred = voices.find(v =>
            v.lang.startsWith(lang || "en") &&
            (v.name.toLowerCase().includes("female") ||
                v.name.toLowerCase().includes("google") ||
                v.name.toLowerCase().includes("zira") ||
                v.name.toLowerCase().includes("heera"))
        );
        if (preferred) utt.voice = preferred;
        synth.speak(utt);
    }
}

// ================= PROFILE / DIFFICULTY =================
const AVATARS = [
    { id: "baby", emoji: "🐣", name: "Baby Bird", age: "2.5 – 3.5 yrs", color: "#fff3e0", border: "#ffcc80" },
    { id: "mid", emoji: "🐬", name: "Dolphin", age: "3.5 – 5 yrs", color: "#e3f2fd", border: "#90caf9" },
    { id: "pro", emoji: "🦁", name: "Lion", age: "5 – 6 yrs", color: "#fce4ec", border: "#f48fb1" }
];

const DIFF = {
    baby: { qCount: 6, maxNum: 5, missLen: 3, compareMax: 5 },
    mid: { qCount: 10, maxNum: 10, missLen: 4, compareMax: 10 },
    pro: { qCount: 16, maxNum: 15, missLen: 4, compareMax: 20 }
};

let currentProfile = localStorage.getItem("kg_profile") || null;

// ================= STATE =================
let currentSet = [];
let index = 0;
let score = 0;
let level = 1;
let currentQ = null;
let currentTheme = "";
let isSuddenDeath = false;
let isDailyChallenge = false;
let suddenDeathStreak = 0;
let currentLang = "en-IN";

// ================= STORAGE HELPERS =================
function saveData(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { }
}
function loadData(key, def) {
    try {
        const v = localStorage.getItem(key);
        return v !== null ? JSON.parse(v) : def;
    } catch (e) { return def; }
}

// ================= STARS =================
function getStars(gameId) { return loadData(`kg_stars_${currentProfile}_${gameId}`, 0); }
function saveStars(gameId, newStars) {
    const best = loadData(`kg_stars_${currentProfile}_${gameId}`, 0);
    if (newStars > best) saveData(`kg_stars_${currentProfile}_${gameId}`, newStars);
}
function calcStars(sc, total) {
    const pct = sc / (total * 10);
    if (pct >= 0.9) return 3;
    if (pct >= 0.6) return 2;
    if (pct > 0) return 1;
    return 0;
}
function starsHTML(n) {
    return [1, 2, 3].map(i =>
        `<span style="color:${i <= n ? '#f5a623' : '#ddd'};font-size:1.1rem">★</span>`
    ).join("");
}

// ================= STREAK =================
function getStreak() { return loadData("kg_streak", { count: 0, lastDate: "" }); }
function updateStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const s = getStreak();
    if (s.lastDate === today) return s.count;
    const newCount = s.lastDate === yesterday ? s.count + 1 : 1;
    saveData("kg_streak", { count: newCount, lastDate: today });
    return newCount;
}
function getStreakCount() { return getStreak().count; }

// ================= LIGHTNING MODE BEST =================
function getSDBest(gameId) { return loadData(`kg_sd_${currentProfile}_${gameId}`, 0); }
function saveSDBest(gameId, n) {
    if (n > getSDBest(gameId)) saveData(`kg_sd_${currentProfile}_${gameId}`, n);
}

// ================= DAILY CHALLENGE =================
function getDailySet() {
    const today = new Date().toISOString().slice(0, 10);
    let seed = today.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    const pool = [
        ...genAlphabet().slice(0, 3),
        ...genCount().slice(0, 3),
        ...genMissingNum().slice(0, 2),
        ...genEvsAnimals().slice(0, 2)
    ];
    return pool.sort(() => rand() - 0.5).slice(0, 10);
}
function isDailyDone() {
    return loadData("kg_daily_date", "") === new Date().toISOString().slice(0, 10);
}
function markDailyDone() {
    saveData("kg_daily_date", new Date().toISOString().slice(0, 10));
}

// ================= SCREEN CONTROL =================
function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

// ================= AVATAR PICKER (now = HOME landing) =================
function showAvatarPicker() {
    renderHome();
}

function selectAvatar(id) {
    currentProfile = id;
    localStorage.setItem("kg_profile", id);
    const a = AVATARS.find(x => x.id === id);
    speak(`Hello ${a.name}! Let's learn and play!`);
    renderSubjects();
}

// ================= HOME (landing screen: hero + avatar picker + streak/daily) =================
function renderHome() {
    synth && synth.cancel();
    const hasProfile = !!currentProfile;
    const avatar = hasProfile ? AVATARS.find(a => a.id === currentProfile) : null;

    const html = `
        <div class="hero-section">
            <div class="logo-badge">🦉 Kidora</div>
            <h1 class="hero-title">Learn, Play & Grow!</h1>
            <p class="hero-subtitle">Fun Learning Activities For Bright Young Minds</p>
            <div class="hero-scene">
                <div class="floating book">📚</div>
                <div class="floating pencil">✏️</div>
                <div class="floating star">⭐</div>
                <img src="assets/images/kids-school.png" class="hero-image" alt="Kids Learning">
            </div>
        </div>

        <div class="avatar-screen">
            <div class="avatar-title">👋 Who is playing?</div>
            <div class="avatar-subtitle">Pick your character to set the right level!</div>
            <div class="avatar-grid">
                ${AVATARS.map(a => `
                    <button class="avatar-card ${a.id === currentProfile ? "avatar-card-selected" : ""}"
                        onclick="selectAvatar('${a.id}')"
                        style="background:${a.color};border:2px solid ${a.border}">
                        ${a.id === currentProfile ? '<span class="avatar-check">✓</span>' : ""}
                        <div class="avatar-emoji">${a.emoji}</div>
                        <div class="avatar-name">${a.name}</div>
                        <div class="avatar-age">${a.age}</div>
                    </button>
                `).join("")}
            </div>
            ${hasProfile ? `<button class="avatar-continue-btn" onclick="renderSubjects()">${avatar.emoji} Continue as ${avatar.name} →</button>` : ""}
        </div>

        <div class="home-tagline">Made with ❤️ for little learners</div>`;

    document.getElementById("home").innerHTML = html;
    showScreen("home");
    if (!hasProfile) speak("Who is playing? Pick your character!");
}

// ================= SUBJECTS SCREEN =================
function renderSubjects() {
    synth && synth.cancel();
    const avatar = AVATARS.find(a => a.id === currentProfile);
    const streak = getStreakCount();
    const dailyDone = isDailyDone();

    const subjects = [
        { id: "english", icon: "📚", label: "English", sub: "Letters & Words", cls: "subj-eng" },
        { id: "hindi", icon: "📖", label: "हिंदी", sub: "स्वर और व्यंजन", cls: "subj-hin" },
        { id: "math", icon: "🔢", label: "Math", sub: "Numbers & Counting", cls: "subj-mat" },
        { id: "evs", icon: "🌿", label: "EVS", sub: "World Around Us", cls: "subj-evs" },
        { id: "activity", icon: "🎯", label: "Activity", sub: "Drag & Play", cls: "subj-act" }
    ];

    const html = `
        <div class="subj-header">
            <button class="subj-home-btn" onclick="goHome()">🏠</button>
            <div class="subj-header-text">
                <div class="subj-greeting">${avatar.emoji} Hi ${avatar.name}!</div>
                <div class="subj-title">What do you want to learn today?</div>
            </div>
            <div class="streak-badge">🔥 ${streak} day${streak !== 1 ? "s" : ""}</div>
        </div>

        <div class="daily-card ${dailyDone ? "daily-done" : ""}"
             onclick="${dailyDone ? "" : "startDailyChallenge()"}">
            <div class="daily-icon">📅</div>
            <div class="daily-info">
                <div class="daily-title">Daily Challenge</div>
                <div class="daily-sub">${dailyDone
            ? "✅ Completed today! Come back tomorrow."
            : "10 mixed questions • New every day"}</div>
            </div>
            ${dailyDone ? "" : '<div class="daily-arrow">›</div>'}
        </div>

        <div class="subj-grid">
            ${subjects.map((s, i) => `
                <button class="subj-tile ${s.cls}" onclick="openCategory('${s.id}')" style="animation-delay:${i * 0.08}s">
                    <div class="subj-tile-icon">${s.icon}</div>
                    <div class="subj-tile-label">${s.label}</div>
                    <div class="subj-tile-sub">${s.sub}</div>
                </button>
            `).join("")}
        </div>`;

    document.getElementById("subjects").innerHTML = html;
    showScreen("subjects");
}

// ================= DAILY CHALLENGE =================
function startDailyChallenge() {
    isDailyChallenge = true;
    isSuddenDeath = false;
    currentLang = "en-IN";
    currentSet = getDailySet();
    _launchGame("daily", "theme-mat");
}

// ================= CATEGORY =================
function openCategory(cat) {
    synth && synth.cancel();
    window._lastCategory = cat;

    const themes = {
        english: { icon: "📚", label: "English", cls: "theme-eng" },
        hindi: { icon: "📖", label: "हिंदी", cls: "theme-hin" },
        math: { icon: "🔢", label: "Math", cls: "theme-mat" },
        evs: { icon: "🌿", label: "EVS", cls: "theme-evs" },
        activity: { icon: "🎯", label: "Activity", cls: "theme-act" }
    };
    const t = themes[cat];

    const games = {
        english: [
            { id: "eng1", icon: "🅰️", name: "Alphabet", desc: "Learn A to Z with fun visuals" },
            { id: "eng2", icon: "❓", name: "Missing Letter", desc: "Fill in the blank in a sequence" },
            { id: "eng3", icon: "🔡", name: "Upper ↔ Lower", desc: "Match capital and small letters" }
        ],
        hindi: [
            { id: "hin1", icon: "📖", name: "स्वर", desc: "अ से अः तक हिंदी स्वर सीखो" },
            { id: "hin2", icon: "🔠", name: "व्यंजन", desc: "क से ज्ञ तक हिंदी व्यंजन सीखो" },
            { id: "hin3", icon: "❓", name: "गायब अक्षर", desc: "क्रम में गायब अक्षर भरो" },
            { id: "hin4", icon: "🔗", name: "मिलाओ", desc: "चित्र को अक्षर से मिलाओ" }
        ],
        math: [
            { id: "math1", icon: "🔢", name: "Count", desc: "Count the stars and pick a number" },
            { id: "math2", icon: "❓", name: "Missing Number", desc: "Fill in the missing number" },
            { id: "math3", icon: "🔗", name: "Match", desc: "Match number to the right count" },
            { id: "math4", icon: "➕", name: "Compare", desc: "Pick the right symbol >, <, =" }
        ],
        evs: [
            { id: "evs1", icon: "🐾", name: "Pet Animals", desc: "Animals we keep at home" },
            { id: "evs2", icon: "🐟", name: "Pond Animals", desc: "Animals that live in water" },
            { id: "evs3", icon: "🦁", name: "Wild Animals", desc: "Animals of the jungle" },
            { id: "evs4", icon: "🐦", name: "Birds", desc: "Feathered friends around us" },
            { id: "evs5", icon: "🌸", name: "Flowers", desc: "Beautiful flowers in nature" },
            { id: "evs6", icon: "🌳", name: "Plants & Trees", desc: "Identify plants and trees" },
            { id: "evs7", icon: "🚗", name: "Transport", desc: "Land, water and air transport" },
            { id: "evs8", icon: "🐣", name: "Baby Animals", desc: "What is a baby animal called?" },
            { id: "evs9", icon: "🏠", name: "Animal Homes", desc: "Where do animals live?" },
            { id: "evs10", icon: "🍎", name: "Fruits & Veggies", desc: "Identify fruits and vegetables" }
        ],
        activity: [
            { id: "act1", icon: "🧩", name: "Shape Sorter — Fruits", desc: "Drag fruit into its matching shape" },
            { id: "act2", icon: "🧩", name: "Shape Sorter — Vehicles", desc: "Drag vehicle into its matching shape" },
            { id: "act3", icon: "🧩", name: "Shape Sorter — Animals", desc: "Drag animal into its matching shape" },
            { id: "act4", icon: "📏", name: "Size Sorter", desc: "Drag smallest to biggest in order" },
            { id: "act5", icon: "🎨", name: "Color Sorter", desc: "Drag items into matching color bucket" },
            { id: "act6", icon: "🔢", name: "Counting Drop", desc: "Drag the right count into the basket" },
            { id: "act7", icon: "🔤", name: "Letter Drop — English", desc: "Drag the letter onto its outline" },
            { id: "act8", icon: "🔤", name: "Letter Drop — Hindi", desc: "हिंदी अक्षर को सही जगह रखें" },
            { id: "act9", icon: "🚦", name: "Category Sort — Land/Air/Water", desc: "Sort transport into the right zone" },
            { id: "act10", icon: "🔡", name: "Build a Word", desc: "Drag letters to spell the word" }
        ]
    };

    const cards = games[cat].map(g => {
        const stars = getStars(g.id);
        const sdBest = getSDBest(g.id);
        const isActivity = cat === "activity";
        return `
        <button class="cat-card ${t.cls}" onclick="${isActivity ? `startActivity('${g.id}')` : `startGame('${g.id}')`}">
            <div class="cat-card-icon">${g.icon}</div>
            <div class="cat-card-info">
                <div class="cat-card-name">${g.name}</div>
                <div class="cat-card-desc">${g.desc}</div>
                <div class="cat-card-stars">${starsHTML(stars)}</div>
            </div>
            <span class="cat-card-arrow">›</span>
        </button>
        ${isActivity ? "" : `
        <button class="sd-btn" onclick="startSuddenDeath('${g.id}')">
            ⚡ Lightning Mode ${sdBest > 0 ? `<span class="sd-best">Best: ${sdBest}</span>` : ""}
        </button>`}`;
    }).join("");

    const html = `
        <div class="cat-header">
            <button class="cat-back-btn" onclick="renderSubjects()">←</button>
            <span class="cat-header-icon">${t.icon}</span>
            <span class="cat-header-title">${t.label}</span>
        </div>
        ${cards}
        <button class="category-home-bottom" onclick="goHome()">🏠 Avatar / Home</button>`;

    document.getElementById("category").innerHTML = html;
    showScreen("category");
    speak(t.label + " — Choose a game!");
}

// ================= START GAME =================
function startGame(type) {
    isSuddenDeath = false;
    isDailyChallenge = false;
    suddenDeathStreak = 0;
    currentLang = type.startsWith("hin") ? "hi-IN" : "en-IN";

    const diff = DIFF[currentProfile] || DIFF.mid;
    // Shuffle the full question pool then slice to diff.qCount —
    // guarantees no repeats within a round AND different questions each visit
    currentSet = _buildSet(type, diff).sort(() => Math.random() - 0.5).slice(0, diff.qCount);

    const theme = _themeFor(type);
    _launchGame(type, theme);
}

function startSuddenDeath(type) {
    isSuddenDeath = true;
    isDailyChallenge = false;
    suddenDeathStreak = 0;
    currentLang = type.startsWith("hin") ? "hi-IN" : "en-IN";

    const diff = DIFF[currentProfile] || DIFF.mid;
    currentSet = _buildSet(type, diff).sort(() => Math.random() - 0.5);
    _launchGame(type, _themeFor(type));
}

function _themeFor(type) {
    if (type.startsWith("eng")) return "theme-eng";
    if (type.startsWith("hin")) return "theme-hin";
    if (type.startsWith("evs")) return "theme-evs";
    return "theme-mat";
}

function _buildSet(type, diff) {
    if (type === "eng1") return genAlphabet();
    if (type === "eng2") return genMissingEng();
    if (type === "eng3") return genUpperLower();
    if (type === "hin1") return genHindi();
    if (type === "hin2") return genVyanjan();
    if (type === "hin3") return genMissingHin();
    if (type === "hin4") return genMatchHin();
    if (type === "math1") return genCount(diff);
    if (type === "math2") return genMissingNum(diff);
    if (type === "math3") return genMatchNum();
    if (type === "math4") return genCompare(diff);
    if (type === "evs1") return genEvsPets();
    if (type === "evs2") return genEvsPond();
    if (type === "evs3") return genEvsWild();
    if (type === "evs4") return genEvsBirds();
    if (type === "evs5") return genEvsFlowers();
    if (type === "evs6") return genEvsTrees();
    if (type === "evs7") return genEvsTransport();
    if (type === "evs8") return genEvsBabyAnimals();
    if (type === "evs9") return genEvsAnimalHomes();
    if (type === "evs10") return genEvsFruits();
    return [];
}

function _launchGame(type, theme) {
    window._lastGameType = type;
    window._lastGameTheme = theme;
    index = 0; score = 0; level = 1;

    document.getElementById("score").innerText = 0;
    document.getElementById("level").innerText = 1;

    const gameEl = document.getElementById("game");
    gameEl.classList.remove("theme-eng", "theme-hin", "theme-mat", "theme-evs", "theme-act");
    gameEl.classList.add(theme);
    currentTheme = theme;

    document.getElementById("visual").style.display = "";
    document.getElementById("visual").innerHTML = "";
    document.getElementById("options").className = "options";

    const sdBar = document.getElementById("sd-bar");
    if (sdBar) sdBar.style.display = isSuddenDeath ? "flex" : "none";

    showScreen("game");
    show();
}

// ================= EVS DATA =================

// Helper: build an EVS question with a large emoji visual
function evsQ(emoji, text, answer, pool) {
    return {
        visual: emoji,
        text,
        answer,
        pool,
        isEVS: true
    };
}

function genEvsPets() {
    const pool = ["Dog", "Cat", "Rabbit", "Parrot", "Fish", "Hamster", "Turtle", "Cow"];
    return [
        evsQ("🐶", "What animal is this?", "Dog", pool),
        evsQ("🐱", "What animal is this?", "Cat", pool),
        evsQ("🐰", "What animal is this?", "Rabbit", pool),
        evsQ("🦜", "What animal is this?", "Parrot", pool),
        evsQ("🐠", "What animal is this?", "Fish", pool),
        evsQ("🐹", "What animal is this?", "Hamster", pool),
        evsQ("🐢", "What animal is this?", "Turtle", pool),
        evsQ("🐄", "What animal is this?", "Cow", pool)
    ];
}

function genEvsPond() {
    const pool = ["Frog", "Fish", "Duck", "Crocodile", "Turtle", "Lotus", "Crab", "Swan"];
    return [
        evsQ("🐸", "What lives in the pond?", "Frog", pool),
        evsQ("🐟", "What lives in the pond?", "Fish", pool),
        evsQ("🦆", "What lives in the pond?", "Duck", pool),
        evsQ("🐊", "What lives in the pond?", "Crocodile", pool),
        evsQ("🐢", "What lives in the pond?", "Turtle", pool),
        evsQ("🪷", "What lives in the pond?", "Lotus", pool),
        evsQ("🦀", "What lives in the pond?", "Crab", pool),
        evsQ("🦢", "What lives in the pond?", "Swan", pool)
    ];
}

function genEvsWild() {
    const pool = ["Lion", "Tiger", "Elephant", "Giraffe", "Zebra", "Bear", "Monkey", "Fox", "Wolf", "Kangaroo"];
    return [
        evsQ("🦁", "What animal is this?", "Lion", pool),
        evsQ("🐯", "What animal is this?", "Tiger", pool),
        evsQ("🐘", "What animal is this?", "Elephant", pool),
        evsQ("🦒", "What animal is this?", "Giraffe", pool),
        evsQ("🦓", "What animal is this?", "Zebra", pool),
        evsQ("🐻", "What animal is this?", "Bear", pool),
        evsQ("🐒", "What animal is this?", "Monkey", pool),
        evsQ("🦊", "What animal is this?", "Fox", pool),
        evsQ("🐺", "What animal is this?", "Wolf", pool),
        evsQ("🦘", "What animal is this?", "Kangaroo", pool)
    ];
}

function genEvsBirds() {
    const pool = ["Parrot", "Peacock", "Sparrow", "Eagle", "Owl", "Flamingo", "Penguin", "Dove", "Crow", "Swan"];
    return [
        evsQ("🦜", "What bird is this?", "Parrot", pool),
        evsQ("🦚", "What bird is this?", "Peacock", pool),
        evsQ("🐦", "What bird is this?", "Sparrow", pool),
        evsQ("🦅", "What bird is this?", "Eagle", pool),
        evsQ("🦉", "What bird is this?", "Owl", pool),
        evsQ("🦩", "What bird is this?", "Flamingo", pool),
        evsQ("🐧", "What bird is this?", "Penguin", pool),
        evsQ("🕊️", "What bird is this?", "Dove", pool),
        evsQ("🐦‍⬛", "What bird is this?", "Crow", pool),
        evsQ("🦢", "What bird is this?", "Swan", pool)
    ];
}

function genEvsFlowers() {
    const pool = ["Rose", "Sunflower", "Lotus", "Hibiscus", "Tulip", "Daisy", "Cherry Blossom"];
    return [
        evsQ("🌹", "What flower is this?", "Rose", pool),
        evsQ("🌻", "What flower is this?", "Sunflower", pool),
        evsQ("🪷", "What flower is this?", "Lotus", pool),
        evsQ("🌺", "What flower is this?", "Hibiscus", pool),
        evsQ("🌷", "What flower is this?", "Tulip", pool),
        evsQ("🌼", "What flower is this?", "Daisy", pool),
        evsQ("🌸", "What flower is this?", "Cherry Blossom", pool)
    ];
}

function genEvsTrees() {
    const pool = ["Palm Tree", "Pine Tree", "Deciduous Tree", "Cactus", "Herb", "Sapling", "Maple Leaf"];
    return [
        evsQ("🌴", "What plant is this?", "Palm Tree", pool),
        evsQ("🌲", "What plant is this?", "Pine Tree", pool),
        evsQ("🌳", "What plant is this?", "Deciduous Tree", pool),
        evsQ("🌵", "What plant is this?", "Cactus", pool),
        evsQ("🌿", "What plant is this?", "Herb", pool),
        evsQ("🌱", "What plant is this?", "Sapling", pool),
        evsQ("🍁", "What plant is this?", "Maple Leaf", pool)
    ];
}

function genEvsTransport() {
    const all = ["Car", "Bus", "Train", "Bicycle", "Auto Rickshaw", "Boat", "Ship", "Aeroplane", "Helicopter", "Hot Air Balloon"];

    return [
        evsQ("🚗", "What is this?", "Car", all),
        evsQ("🚌", "What is this?", "Bus", all),
        evsQ("🚂", "What is this?", "Train", all),
        evsQ("🚲", "What is this?", "Bicycle", all),
        evsQ("🛺", "What is this?", "Auto Rickshaw", all),
        evsQ("🚤", "What is this?", "Boat", all),
        evsQ("🚢", "What is this?", "Ship", all),
        evsQ("✈️", "What is this?", "Aeroplane", all),
        evsQ("🚁", "What is this?", "Helicopter", all),
        evsQ("🎈", "What is this?", "Hot Air Balloon", all),
        // Category questions
        { visual: "🚗", text: "Car travels on?", answer: "Land", pool: ["Land", "Water", "Air"], isEVS: false },
        { visual: "🚢", text: "Ship travels on?", answer: "Water", pool: ["Land", "Water", "Air"], isEVS: false },
        { visual: "✈️", text: "Aeroplane travels in?", answer: "Air", pool: ["Land", "Water", "Air"], isEVS: false },
        { visual: "🚲", text: "Bicycle travels on?", answer: "Land", pool: ["Land", "Water", "Air"], isEVS: false },
        { visual: "🚁", text: "Helicopter travels in?", answer: "Air", pool: ["Land", "Water", "Air"], isEVS: false },
    ];
}

function genEvsBabyAnimals() {
    const pool = ["Puppy", "Kitten", "Calf", "Foal", "Cub", "Chick", "Lamb", "Kid", "Duckling", "Piglet"];
    return [
        { visual: "🐶", text: "Baby dog is called?", answer: "Puppy", pool, isEVS: false },
        { visual: "🐱", text: "Baby cat is called?", answer: "Kitten", pool, isEVS: false },
        { visual: "🐄", text: "Baby cow is called?", answer: "Calf", pool, isEVS: false },
        { visual: "🐎", text: "Baby horse is called?", answer: "Foal", pool, isEVS: false },
        { visual: "🦁", text: "Baby lion is called?", answer: "Cub", pool, isEVS: false },
        { visual: "🐔", text: "Baby hen is called?", answer: "Chick", pool, isEVS: false },
        { visual: "🐑", text: "Baby sheep is called?", answer: "Lamb", pool, isEVS: false },
        { visual: "🐐", text: "Baby goat is called?", answer: "Kid", pool, isEVS: false },
        { visual: "🦆", text: "Baby duck is called?", answer: "Duckling", pool, isEVS: false },
        { visual: "🐷", text: "Baby pig is called?", answer: "Piglet", pool, isEVS: false }
    ];
}

function genEvsAnimalHomes() {
    const pool = ["Den", "Nest", "Stable", "Kennel", "Burrow", "Hive", "Dam", "Sty", "Pond", "Tree"];
    return [
        { visual: "🦁", text: "Lion lives in?", answer: "Den", pool, isEVS: false },
        { visual: "🐦", text: "Bird lives in?", answer: "Nest", pool, isEVS: false },
        { visual: "🐎", text: "Horse lives in?", answer: "Stable", pool, isEVS: false },
        { visual: "🐶", text: "Dog lives in?", answer: "Kennel", pool, isEVS: false },
        { visual: "🐰", text: "Rabbit lives in?", answer: "Burrow", pool, isEVS: false },
        { visual: "🐝", text: "Bee lives in?", answer: "Hive", pool, isEVS: false },
        { visual: "🦫", text: "Beaver lives in?", answer: "Dam", pool, isEVS: false },
        { visual: "🐷", text: "Pig lives in?", answer: "Sty", pool, isEVS: false },
        { visual: "🐟", text: "Fish lives in?", answer: "Pond", pool, isEVS: false },
        { visual: "🐒", text: "Monkey lives in?", answer: "Tree", pool, isEVS: false }
    ];
}

function genEvsFruits() {
    const pool = ["Apple", "Mango", "Banana", "Grapes", "Orange", "Watermelon", "Strawberry", "Pineapple", "Carrot", "Tomato", "Potato", "Broccoli"];
    return [
        evsQ("🍎", "What is this?", "Apple", pool),
        evsQ("🥭", "What is this?", "Mango", pool),
        evsQ("🍌", "What is this?", "Banana", pool),
        evsQ("🍇", "What is this?", "Grapes", pool),
        evsQ("🍊", "What is this?", "Orange", pool),
        evsQ("🍉", "What is this?", "Watermelon", pool),
        evsQ("🍓", "What is this?", "Strawberry", pool),
        evsQ("🍍", "What is this?", "Pineapple", pool),
        evsQ("🥕", "What is this?", "Carrot", pool),
        evsQ("🍅", "What is this?", "Tomato", pool),
        evsQ("🥔", "What is this?", "Potato", pool),
        evsQ("🥦", "What is this?", "Broccoli", pool)
    ];
}

// Combined EVS pool for daily challenge
function genEvsAnimals() {
    return [...genEvsPets().slice(0, 3), ...genEvsWild().slice(0, 3), ...genEvsBirds().slice(0, 3)];
}

// ================= ENGLISH DATA =================
function genAlphabet() {
    return [
        ["🍎", "A"], ["⚽", "B"], ["🐱", "C"], ["🐶", "D"], ["🐘", "E"],
        ["🐟", "F"], ["🍇", "G"], ["🏠", "H"], ["🍦", "I"], ["🤹", "J"],
        ["🪁", "K"], ["🦁", "L"], ["🐒", "M"], ["👃", "N"], ["🐙", "O"],
        ["🦜", "P"], ["👑", "Q"], ["🤖", "R"], ["🌞", "S"], ["🌳", "T"],
        ["☂️", "U"], ["🎻", "V"], ["🍉", "W"], ["❌", "X"], ["🪀", "Y"], ["🦓", "Z"]
    ].map(x => ({ visual: x[0], text: "Which alphabet?", answer: x[1] }));
}

function genMissingEng() {
    const l = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    let arr = [];
    for (let i = 0; i < l.length - 3; i++) {
        let s = l.slice(i, i + 4);
        let m = Math.floor(Math.random() * 4);
        let ans = s[m]; s[m] = "❓";
        arr.push({ visual: s.join(" "), text: "Which letter is missing?", answer: ans });
    }
    return arr;
}

function genUpperLower() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    // Half the questions show uppercase->find lowercase, half show lowercase->find uppercase
    return letters.map((up, i) => {
        const low = up.toLowerCase();
        if (i % 2 === 0) {
            return { visual: up, text: `Find the small letter for "${up}"`, answer: low, pool: "abcdefghijklmnopqrstuvwxyz".split("") };
        } else {
            return { visual: low, text: `Find the capital letter for "${low}"`, answer: up, pool: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") };
        }
    });
}

// ================= HINDI DATA =================
function genHindi() {
    return [
        { visual: "🍍", text: "अनार — कौन सा अक्षर?", answer: "अ" },
        { visual: "🥭", text: "आम — कौन सा अक्षर?", answer: "आ" },
        { visual: "🫒", text: "इमली — कौन सा अक्षर?", answer: "इ" },
        { visual: "🦉", text: "उल्लू — कौन सा अक्षर?", answer: "उ" },
        { visual: "🧶", text: "ऊन — कौन सा अक्षर?", answer: "ऊ" },
        { visual: "🧘", text: "ऋषि — कौन सा अक्षर?", answer: "ऋ" },
        { visual: "🚂", text: "एड़ी — कौन सा अक्षर?", answer: "ए" },
        { visual: "👓", text: "ऐनक — कौन सा अक्षर?", answer: "ऐ" },
        { visual: "🧺", text: "ओखली — कौन सा अक्षर?", answer: "ओ" },
        { visual: "👩", text: "औरत — कौन सा अक्षर?", answer: "औ" },
        { visual: "🍇", text: "अंगूर — कौन सा अक्षर?", answer: "अं" },
        { visual: "😮", text: "अः — कौन सा अक्षर?", answer: "अः" }
    ];
}

function genVyanjan() {
    return [
        { visual: "🐶 कुत्ता", text: "शुरुआती अक्षर?", answer: "क" },
        { visual: "🐰 खरगोश", text: "शुरुआती अक्षर?", answer: "ख" },
        { visual: "🌹 गुलाब", text: "शुरुआती अक्षर?", answer: "ग" },
        { visual: "🏠 घर", text: "शुरुआती अक्षर?", answer: "घ" },
        { visual: "🥄 चम्मच", text: "शुरुआती अक्षर?", answer: "च" },
        { visual: "☂️ छाता", text: "शुरुआती अक्षर?", answer: "छ" },
        { visual: "🚢 जहाज", text: "शुरुआती अक्षर?", answer: "ज" },
        { visual: "🪟 झरोखा", text: "शुरुआती अक्षर?", answer: "झ" },
        { visual: "🍅 टमाटर", text: "शुरुआती अक्षर?", answer: "ट" },
        { visual: "🛒 ठेला", text: "शुरुआती अक्षर?", answer: "ठ" },
        { visual: "🥁 डमरू", text: "शुरुआती अक्षर?", answer: "ड" },
        { visual: "🛡️ ढाल", text: "शुरुआती अक्षर?", answer: "ढ" },
        { visual: "🧵 तागा", text: "शुरुआती अक्षर?", answer: "त" },
        { visual: "🥣 थाली", text: "शुरुआती अक्षर?", answer: "थ" },
        { visual: "🚪 दरवाज़ा", text: "शुरुआती अक्षर?", answer: "द" },
        { visual: "🏹 धनुष", text: "शुरुआती अक्षर?", answer: "ध" },
        { visual: "🚰 नल", text: "शुरुआती अक्षर?", answer: "न" },
        { visual: "🍃 पत्ता", text: "शुरुआती अक्षर?", answer: "प" },
        { visual: "🪓 फरसा", text: "शुरुआती अक्षर?", answer: "फ" },
        { visual: "🐐 बकरी", text: "शुरुआती अक्षर?", answer: "ब" },
        { visual: "🐻 भालू", text: "शुरुआती अक्षर?", answer: "भ" },
        { visual: "🐟 मछली", text: "शुरुआती अक्षर?", answer: "म" },
        { visual: "✈️ यान", text: "शुरुआती अक्षर?", answer: "य" },
        { visual: "🚂 रेल", text: "शुरुआती अक्षर?", answer: "र" },
        { visual: "🪀 लट्टू", text: "शुरुआती अक्षर?", answer: "ल" },
        { visual: "🌳 वन", text: "शुरुआती अक्षर?", answer: "व" },
        { visual: "🦁 शेर", text: "शुरुआती अक्षर?", answer: "श" },
        { visual: "☀️ सूरज", text: "शुरुआती अक्षर?", answer: "स" },
        { visual: "✋ हाथ", text: "शुरुआती अक्षर?", answer: "ह" },
        { visual: "🛡️ क्षत्रिय", text: "शुरुआती अक्षर?", answer: "क्ष" },
        { visual: "🔱 त्रिशूल", text: "शुरुआती अक्षर?", answer: "त्र" },
        { visual: "📚 ज्ञानी", text: "शुरुआती अक्षर?", answer: "ज्ञ" }
    ];
}

function genMissingHin() {
    return [
        "क ख ग घ ङ", "च छ ज झ ञ", "ट ठ ड ढ ण",
        "त थ द ध न", "प फ ब भ म", "य र ल व", "श ष स ह", "क्ष त्र ज्ञ"
    ].map(x => {
        let p = x.split(" ");
        let i = Math.floor(Math.random() * p.length);
        let ans = p[i]; p[i] = "❓";
        return { visual: p.join(" "), text: "कौन सा अक्षर गायब है?", answer: ans };
    });
}

function genMatchHin() {
    return [
        { visual: "🐶 कुत्ता", text: "अक्षर मिलाओ", answer: "क" },
        { visual: "🐰 खरगोश", text: "अक्षर मिलाओ", answer: "ख" },
        { visual: "🌹 गुलाब", text: "अक्षर मिलाओ", answer: "ग" },
        { visual: "🏠 घर", text: "अक्षर मिलाओ", answer: "घ" },
        { visual: "🥄 चम्मच", text: "अक्षर मिलाओ", answer: "च" },
        { visual: "☂️ छाता", text: "अक्षर मिलाओ", answer: "छ" },
        { visual: "🚢 जहाज", text: "अक्षर मिलाओ", answer: "ज" },
        { visual: "🛡️ ढाल", text: "अक्षर मिलाओ", answer: "ढ" },
        { visual: "🚰 नल", text: "अक्षर मिलाओ", answer: "न" },
        { visual: "🍃 पत्ता", text: "अक्षर मिलाओ", answer: "प" },
        { visual: "🐐 बकरी", text: "अक्षर मिलाओ", answer: "ब" },
        { visual: "🐟 मछली", text: "अक्षर मिलाओ", answer: "म" },
        { visual: "🚂 रेल", text: "अक्षर मिलाओ", answer: "र" },
        { visual: "🦁 शेर", text: "अक्षर मिलाओ", answer: "श" },
        { visual: "✋ हाथ", text: "अक्षर मिलाओ", answer: "ह" }
    ];
}

// ================= MATH DATA =================
function genCount(diff) {
    diff = diff || DIFF.mid;
    // Build pool of every number 1..maxNum, shuffle, slice — no repeats
    const pool = Array.from({ length: diff.maxNum }, (_, i) => i + 1);
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, diff.qCount);
    return shuffled.map(c => ({
        visual: "⭐".repeat(c),
        text: "Count the stars!",
        answer: String(c)
    }));
}

function genMissingNum(diff) {
    diff = diff || DIFF.mid;
    let arr = [];
    for (let i = 1; i <= diff.maxNum; i++) {
        let s = Array.from({ length: diff.missLen }, (_, k) => i + k);
        let m = Math.floor(Math.random() * diff.missLen);
        let ans = s[m]; s[m] = "❓";
        arr.push({ visual: s.join("  "), text: "Which number is missing?", answer: String(ans) });
    }
    return arr;
}

function genMatchNum() {
    return [1, 2, 3, 4, 5].map(n => ({
        visual: `${n} ${"⭐".repeat(n)}`, text: "Match the number", answer: String(n)
    }));
}

function genCompare(diff) {
    diff = diff || DIFF.mid;
    const max = diff.compareMax;
    // Build pool of all unique pairs (a,b) where a !== b, plus a few equal pairs
    const pool = [];
    for (let a = 0; a <= max; a++) {
        for (let b = 0; b <= max; b++) {
            if (a !== b) {
                const ans = a > b ? ">" : "<";
                pool.push({ visual: `${a}  ?  ${b}`, text: "Choose the right symbol", answer: ans });
            }
        }
    }
    // Add a handful of equals (a = a)
    for (let a = 0; a <= max; a++) {
        pool.push({ visual: `${a}  ?  ${a}`, text: "Choose the right symbol", answer: "=" });
    }
    // Shuffle the full pool then slice — guaranteed unique
    return pool.sort(() => Math.random() - 0.5).slice(0, diff.qCount);
}

// ================= ACTIVITY: DATA =================

function actQ(items, instruction) {
    // items: [{id, emoji, label}], shuffled drag tray + drop zones generated by caller
    return { items, instruction };
}

function genActShapeFruits() {
    const all = [
        { id: "apple", emoji: "🍎" }, { id: "banana", emoji: "🍌" },
        { id: "grapes", emoji: "🍇" }, { id: "orange", emoji: "🍊" },
        { id: "mango", emoji: "🥭" }, { id: "pineapple", emoji: "🍍" },
        { id: "watermelon", emoji: "🍉" }, { id: "strawberry", emoji: "🍓" }
    ];
    return _buildShapeRounds(all, 6);
}

function genActShapeVehicles() {
    const all = [
        { id: "car", emoji: "🚗" }, { id: "bus", emoji: "🚌" },
        { id: "bike", emoji: "🚲" }, { id: "train", emoji: "🚂" },
        { id: "plane", emoji: "✈️" }, { id: "boat", emoji: "🚤" },
        { id: "truck", emoji: "🚚" }, { id: "heli", emoji: "🚁" }
    ];
    return _buildShapeRounds(all, 6);
}

function genActShapeAnimals() {
    const all = [
        { id: "lion", emoji: "🦁" }, { id: "dog", emoji: "🐶" },
        { id: "cat", emoji: "🐱" }, { id: "elephant", emoji: "🐘" },
        { id: "rabbit", emoji: "🐰" }, { id: "bear", emoji: "🐻" },
        { id: "fox", emoji: "🦊" }, { id: "monkey", emoji: "🐒" }
    ];
    return _buildShapeRounds(all, 6);
}

// Each round: 1 drag item + 4 drop zone shapes (1 correct, 3 distractors)
function _buildShapeRounds(all, roundCount) {
    // Shuffle the full list once so each item appears as "correct" at most once
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, roundCount).map(correct => {
        // Pick 3 unique distractors from the rest of the list
        const distractors = all
            .filter(x => x.id !== correct.id)
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);
        const zones = [correct, ...distractors].sort(() => Math.random() - 0.5);
        return {
            mode: "shape",
            instruction: `Drag the ${correct.id} into the matching shape!`,
            drag: [correct],
            zones: zones.map(z => ({ ...z, isTarget: z.id === correct.id }))
        };
    });
}

function genActSize() {
    const sets = [
        [{ id: "ant", emoji: "🐜", size: 1 }, { id: "cat", emoji: "🐱", size: 2 }, { id: "dog", emoji: "🐶", size: 3 }, { id: "elephant", emoji: "🐘", size: 4 }],
        [{ id: "berry", emoji: "🫐", size: 1 }, { id: "apple", emoji: "🍎", size: 2 }, { id: "melon", emoji: "🍈", size: 3 }, { id: "watermelon", emoji: "🍉", size: 4 }],
        [{ id: "mouse", emoji: "🐭", size: 1 }, { id: "rabbit", emoji: "🐰", size: 2 }, { id: "dog2", emoji: "🐕", size: 3 }, { id: "giraffe", emoji: "🦒", size: 4 }],
        [{ id: "marble", emoji: "⚪", size: 1 }, { id: "ball", emoji: "⚽", size: 2 }, { id: "balloon", emoji: "🎈", size: 3 }, { id: "sun", emoji: "☀️", size: 4 }],
        [{ id: "egg", emoji: "🥚", size: 1 }, { id: "orange2", emoji: "🍊", size: 2 }, { id: "pineapple2", emoji: "🍍", size: 3 }, { id: "pumpkin", emoji: "🎃", size: 4 }]
    ];
    return sets.map(items => ({
        mode: "size",
        instruction: "Drag from smallest to biggest, in order!",
        drag: [...items].sort(() => Math.random() - 0.5),
        zones: [1, 2, 3, 4].map(n => ({ id: `slot${n}`, order: n, label: `#${n}` })),
        correctOrder: items.sort((a, b) => a.size - b.size).map(i => i.id)
    }));
}

function genActColor() {
    const buckets = [
        { id: "red", color: "#e74c3c", label: "Red" },
        { id: "yellow", color: "#f1c40f", label: "Yellow" },
        { id: "green", color: "#2ecc71", label: "Green" },
        { id: "blue", color: "#3498db", label: "Blue" }
    ];
    const items = [
        { id: "apple", emoji: "🍎", color: "red" },
        { id: "strawberry", emoji: "🍓", color: "red" },
        { id: "banana", emoji: "🍌", color: "yellow" },
        { id: "lemon", emoji: "🍋", color: "yellow" },
        { id: "grapes2", emoji: "🍏", color: "green" },
        { id: "broccoli", emoji: "🥦", color: "green" },
        { id: "blueberry", emoji: "🫐", color: "blue" },
        { id: "droplet", emoji: "💧", color: "blue" }
    ];
    // Shuffle once so every item is used before any repeat
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6).map(item => ({
        mode: "color",
        instruction: `Drag the ${item.emoji} into its color bucket!`,
        drag: [item],
        zones: buckets.map(b => ({ ...b, isTarget: b.id === item.color }))
    }));
}

function genActCounting() {
    // Targets 2-5 (4 unique values), shuffle so no repeats across 4 rounds
    const targets = [2, 3, 4, 5].sort(() => Math.random() - 0.5);
    return targets.map(target => ({
        mode: "counting",
        instruction: `Drag ${target} stars into the basket!`,
        target,
        dragPoolSize: 6,
        zones: [{ id: "basket", emoji: "🧺", label: "Basket" }]
    }));
}

function genActLetterEng() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    // Shuffle once, pick 8 unique letters — no repeats
    const picked = [...letters].sort(() => Math.random() - 0.5).slice(0, 8);
    return picked.map(correct => {
        // Build 3 unique wrong options from remaining letters
        const wrong = letters.filter(l => l !== correct)
            .sort(() => Math.random() - 0.5).slice(0, 3);
        const zones = [correct, ...wrong].sort(() => Math.random() - 0.5);
        return {
            mode: "shape",
            instruction: `Drag the letter ${correct} into the matching outline!`,
            drag: [{ id: correct, emoji: correct }],
            zones: zones.map(z => ({ id: z, emoji: z, isTarget: z === correct }))
        };
    });
}

function genActLetterHin() {
    const letters = ["क", "ख", "ग", "घ", "च", "छ", "ज", "झ", "ट", "ठ", "प", "फ", "ब", "भ", "म", "य", "र", "ल", "व", "स", "ह"];
    // Shuffle once, pick 8 unique letters — no repeats
    const picked = [...letters].sort(() => Math.random() - 0.5).slice(0, 8);
    return picked.map(correct => {
        const wrong = letters.filter(l => l !== correct)
            .sort(() => Math.random() - 0.5).slice(0, 3);
        const zones = [correct, ...wrong].sort(() => Math.random() - 0.5);
        return {
            mode: "shape",
            instruction: `अक्षर ${correct} को सही जगह खींचें!`,
            drag: [{ id: correct, emoji: correct }],
            zones: zones.map(z => ({ id: z, emoji: z, isTarget: z === correct }))
        };
    });
}

function genActCategorySort() {
    const items = [
        { id: "car3", emoji: "🚗", cat: "land" }, { id: "bus3", emoji: "🚌", cat: "land" },
        { id: "bike3", emoji: "🚲", cat: "land" }, { id: "train3", emoji: "🚂", cat: "land" },
        { id: "boat3", emoji: "🚤", cat: "water" }, { id: "ship3", emoji: "🚢", cat: "water" },
        { id: "plane3", emoji: "✈️", cat: "air" }, { id: "heli3", emoji: "🚁", cat: "air" },
        { id: "balloon3", emoji: "🎈", cat: "air" }
    ];
    const zones = [
        { id: "land", emoji: "🛣️", label: "Land" },
        { id: "water", emoji: "🌊", label: "Water" },
        { id: "air", emoji: "☁️", label: "Air" }
    ];
    // Shuffle once so every item is used before any repeat
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 8).map(item => ({
        mode: "category",
        instruction: `Where does ${item.emoji} belong? Drag it to the right zone!`,
        drag: [item],
        zones: zones.map(z => ({ ...z, isTarget: z.id === item.cat }))
    }));
}

function genActBuildWord() {
    const words = [
        { word: "CAT", emoji: "🐱" }, { word: "DOG", emoji: "🐶" },
        { word: "SUN", emoji: "☀️" }, { word: "BUS", emoji: "🚌" },
        { word: "HAT", emoji: "🎩" }, { word: "CUP", emoji: "☕" },
        { word: "PEN", emoji: "🖊️" }, { word: "BAG", emoji: "👜" }
    ];
    return words.map(w => ({
        mode: "word",
        instruction: `Spell the word for ${w.emoji}`,
        word: w.word,
        drag: w.word.split("").map((ch, i) => ({ id: `${ch}-${i}`, emoji: ch })).sort(() => Math.random() - 0.5),
        zones: w.word.split("").map((ch, i) => ({ id: `slot-${i}`, order: i, label: "" }))
    }));
}

// ================= ACTIVITY: STATE =================
let activitySet = [];
let activityIndex = 0;
let activityScore = 0;
let activityType = "";
let activityPlacedCorrect = 0;
let activityRoundTotal = 0;

function startActivity(type) {
    activityType = type;
    activityIndex = 0;
    activityScore = 0;
    score = 0; level = 1;

    document.getElementById("score").innerText = 0;
    document.getElementById("level").innerText = 1;

    if (type === "act1") activitySet = genActShapeFruits();
    if (type === "act2") activitySet = genActShapeVehicles();
    if (type === "act3") activitySet = genActShapeAnimals();
    if (type === "act4") activitySet = genActSize();
    if (type === "act5") activitySet = genActColor();
    if (type === "act6") activitySet = genActCounting();
    if (type === "act7") activitySet = genActLetterEng();
    if (type === "act8") activitySet = genActLetterHin();
    if (type === "act9") activitySet = genActCategorySort();
    if (type === "act10") activitySet = genActBuildWord();

    window._lastGameType = type;
    const gameEl = document.getElementById("game");
    gameEl.classList.remove("theme-eng", "theme-hin", "theme-mat", "theme-evs", "theme-act");
    gameEl.classList.add("theme-act");
    currentTheme = "theme-act";

    document.getElementById("sd-bar").style.display = "none";
    document.getElementById("visual").style.display = "none";
    document.getElementById("visual").classList.remove("evs-visual");

    showScreen("game");
    showActivityRound();
}

function showActivityRound() {
    if (activityIndex >= activitySet.length) {
        showActivityWin();
        return;
    }

    const round = activitySet[activityIndex];
    speak(round.instruction);

    document.getElementById("question").innerText = round.instruction;
    document.getElementById("progress").innerText = `${activityIndex + 1}/${activitySet.length}`;
    document.getElementById("progressFill").style.width =
        ((activityIndex + 1) / activitySet.length * 100) + "%";

    const box = document.getElementById("options");
    box.className = "options act-board";
    box.innerHTML = "";

    if (round.mode === "counting") {
        renderCountingRound(round, box);
    } else {
        renderDragRound(round, box);
    }
}

// ---- Generic drag round renderer (shape / color / size / category / letter / word) ----
function renderDragRound(round, box) {
    activityPlacedCorrect = 0;
    activityRoundTotal = round.drag.length;

    const tray = document.createElement("div");
    tray.className = "act-tray";

    const dropArea = document.createElement("div");
    dropArea.className = "act-dropzone-area";
    if (round.mode === "size" || round.mode === "word") dropArea.classList.add("act-dropzone-row");

    round.zones.forEach(z => {
        const zone = document.createElement("div");
        zone.className = "act-zone";
        zone.dataset.zoneId = z.id;
        if (round.mode === "color") {
            zone.classList.add("act-zone-color");
            zone.style.background = z.color;
            zone.innerHTML = `<span class="act-zone-label">${z.label}</span>`;
        } else if (round.mode === "category") {
            zone.classList.add("act-zone-category");
            zone.innerHTML = `<span class="act-zone-emoji">${z.emoji}</span><span class="act-zone-label">${z.label}</span>`;
        } else if (round.mode === "size") {
            zone.classList.add("act-zone-slot");
            zone.innerHTML = `<span class="act-zone-label">${z.label}</span>`;
        } else if (round.mode === "word") {
            zone.classList.add("act-zone-letterslot");
            zone.innerHTML = `<span class="act-zone-placeholder">_</span>`;
        } else {
            // shape outline
            zone.classList.add("act-zone-shape");
            zone.innerHTML = `<span class="act-zone-outline">${z.emoji}</span>`;
        }
        dropArea.appendChild(zone);
    });

    round.drag.forEach(item => {
        const chip = document.createElement("div");
        chip.className = "act-chip";
        chip.dataset.itemId = item.id;
        chip.innerHTML = item.emoji;
        if (round.mode === "color") chip.classList.add("act-chip-emoji");
        tray.appendChild(chip);
        makeDraggable(chip, round, item);
    });

    box.appendChild(dropArea);
    box.appendChild(tray);
}

// ---- Counting round: tray has N draggable stars (one per click adds to basket) ----
function renderCountingRound(round, box) {
    const dropArea = document.createElement("div");
    dropArea.className = "act-dropzone-area";

    const basket = document.createElement("div");
    basket.className = "act-zone act-basket";
    basket.dataset.zoneId = "basket";
    basket.innerHTML = `<span class="act-zone-emoji">🧺</span><div class="act-basket-count" id="basket-count">0</div>`;
    dropArea.appendChild(basket);

    const tray = document.createElement("div");
    tray.className = "act-tray";
    for (let i = 0; i < round.dragPoolSize; i++) {
        const chip = document.createElement("div");
        chip.className = "act-chip";
        chip.dataset.itemId = `star${i}`;
        chip.innerHTML = "⭐";
        tray.appendChild(chip);
        makeDraggableCounting(chip, round);
    }

    box.appendChild(dropArea);
    box.appendChild(tray);
    window._countingDropped = 0;
}

// ================= POINTER-EVENTS DRAG ENGINE =================
function resetChipStyle(chip) {
    chip.style.position = "";
    chip.style.zIndex = "";
    chip.style.left = "";
    chip.style.top = "";
    chip.style.width = "";
    chip.style.height = "";
    chip.style.margin = "";
}

function makeDraggable(chip, round, item) {
    let startX, startY, placed = false;

    chip.style.touchAction = "none";

    chip.addEventListener("pointerdown", (e) => {
        if (placed) return;
        e.preventDefault();
        const rect = chip.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;

        // .container uses backdrop-filter, which creates a CSS containing
        // block for descendants — so position:fixed would be positioned
        // relative to .container, not the viewport. Reparenting to <body>
        // escapes that. IMPORTANT: this must happen BEFORE setPointerCapture,
        // otherwise capture breaks on many mobile browsers.
        chip.style.width = rect.width + "px";
        chip.style.height = rect.height + "px";
        document.body.appendChild(chip);
        chip.style.position = "fixed";
        chip.style.left = rect.left + "px";
        chip.style.top = rect.top + "px";
        chip.style.zIndex = "9999";
        chip.style.margin = "0";

        chip.classList.add("act-dragging");

        try { chip.setPointerCapture(e.pointerId); } catch (err) { }

        moveChip(e);
    });

    chip.addEventListener("pointermove", (e) => {
        if (!chip.classList.contains("act-dragging")) return;
        e.preventDefault();
        moveChip(e);
    });

    chip.addEventListener("pointerup", (e) => {
        if (!chip.classList.contains("act-dragging")) return;
        e.preventDefault();
        chip.classList.remove("act-dragging");
        try { chip.releasePointerCapture(e.pointerId); } catch (err) { }
        handleDrop(chip, e, round, item);
    });

    chip.addEventListener("pointercancel", (e) => {
        if (!chip.classList.contains("act-dragging")) return;
        chip.classList.remove("act-dragging");
        resetChipStyle(chip);
        const tray = document.querySelector(".act-tray");
        if (tray && chip.parentNode !== tray) tray.appendChild(chip);
    });

    function moveChip(e) {
        chip.style.left = (e.clientX - startX) + "px";
        chip.style.top = (e.clientY - startY) + "px";
    }

    function handleDrop(chip, e, round, item) {
        chip.style.visibility = "hidden";
        const target = document.elementFromPoint(e.clientX, e.clientY);
        chip.style.visibility = "";
        const zone = target && target.closest(".act-zone");

        resetChipStyle(chip);

        let isCorrect = false;

        if (zone) {
            if (round.mode === "size") {
                const order = round.correctOrder.indexOf(item.id);
                const zoneOrder = parseInt(zone.dataset.zoneId.replace("slot", ""), 10) - 1;
                isCorrect = order === zoneOrder && !zone.classList.contains("act-zone-filled");
            } else if (round.mode === "word") {
                const idx = round.zones.findIndex(z => z.id === zone.dataset.zoneId);
                const expectedChar = round.word[idx];
                isCorrect = item.emoji === expectedChar && !zone.classList.contains("act-zone-filled");
            } else {
                isCorrect = zone.dataset.zoneId === (round.zones.find(z => z.isTarget)?.id) && !zone.classList.contains("act-zone-filled");
            }
        }

        if (isCorrect) {
            placed = true;
            correctSound.play();
            zone.classList.add("act-zone-filled", "act-zone-correct-flash");
            zone.innerHTML = `<span class="act-zone-placed">${item.emoji}</span>`;
            chip.remove();
            activityPlacedCorrect++;
            activityScore += 10;
            score = activityScore;
            document.getElementById("score").innerText = score;

            if (activityPlacedCorrect >= activityRoundTotal) {
                speak("Correct! Well done!");
                setTimeout(() => { activityIndex++; showActivityRound(); }, 700);
            }
        } else {
            wrongSound.play();
            chip.classList.add("act-chip-shake");
            // Snap back to tray
            const tray = document.querySelector(".act-tray");
            tray.appendChild(chip);
            setTimeout(() => chip.classList.remove("act-chip-shake"), 500);
        }
    }
}

function makeDraggableCounting(chip, round) {
    let placed = false;
    chip.style.touchAction = "none";

    chip.addEventListener("pointerdown", (e) => {
        if (placed) return;
        e.preventDefault();
        const rect = chip.getBoundingClientRect();
        chip._offX = e.clientX - rect.left;
        chip._offY = e.clientY - rect.top;

        chip.style.width = rect.width + "px";
        chip.style.height = rect.height + "px";
        document.body.appendChild(chip);
        chip.style.position = "fixed";
        chip.style.left = rect.left + "px";
        chip.style.top = rect.top + "px";
        chip.style.zIndex = "9999";
        chip.style.margin = "0";

        chip.classList.add("act-dragging");
        try { chip.setPointerCapture(e.pointerId); } catch (err) { }
        move(e);
    });

    chip.addEventListener("pointermove", (e) => {
        if (!chip.classList.contains("act-dragging")) return;
        e.preventDefault();
        move(e);
    });

    chip.addEventListener("pointerup", (e) => {
        if (!chip.classList.contains("act-dragging")) return;
        e.preventDefault();
        chip.classList.remove("act-dragging");
        try { chip.releasePointerCapture(e.pointerId); } catch (err) { }

        chip.style.visibility = "hidden";
        const target = document.elementFromPoint(e.clientX, e.clientY);
        chip.style.visibility = "";
        const zone = target && target.closest(".act-basket");

        resetChipStyle(chip);

        if (zone) {
            window._countingDropped = (window._countingDropped || 0) + 1;
            placed = true;
            chip.remove();
            document.getElementById("basket-count").innerText = window._countingDropped;

            if (window._countingDropped === round.target) {
                correctSound.play();
                speak("Correct! Well done!");
                activityScore += 10;
                score = activityScore;
                document.getElementById("score").innerText = score;
                setTimeout(() => { activityIndex++; showActivityRound(); }, 700);
            } else if (window._countingDropped > round.target) {
                wrongSound.play();
                speak("Too many! Let's try again.");
                setTimeout(() => showActivityRound(), 900);
            } else {
                correctSound.play();
            }
        } else {
            const tray = document.querySelector(".act-tray");
            tray.appendChild(chip);
        }
    });

    function move(e) {
        chip.style.left = (e.clientX - chip._offX) + "px";
        chip.style.top = (e.clientY - chip._offY) + "px";
    }
}

function showActivityWin() {
    winSound.play();
    const stars = calcStars(activityScore, activitySet.length);
    saveStars(activityType, stars);
    speak(`Great job! You finished the activity!`);

    const confettiEmojis = ["⭐", "🎉", "✨", "🌟", "🎊", "💫", "🏅", "🎈"];
    const confettiHTML = Array.from({ length: 12 }, (_, i) => {
        const emoji = confettiEmojis[i % confettiEmojis.length];
        const left = Math.random() * 90 + 5;
        const delay = (Math.random() * 0.8).toFixed(2);
        return `<span style="left:${left}%;animation-delay:${delay}s">${emoji}</span>`;
    }).join("");

    document.getElementById("options").className = "options";
    document.getElementById("options").innerHTML = "";
    document.getElementById("question").innerHTML = `
        <div class="win-screen">
            <div class="win-confetti">${confettiHTML}</div>
            <span class="win-trophy">🏆</span>
            <div class="win-title">🎉 Activity Complete!</div>
            <div class="win-stars">${starsHTML(stars)}</div>
            <div class="win-badges">
                <div class="win-badge gold">
                    <span class="badge-label">⭐ Score</span>
                    <span class="badge-value">${activityScore}</span>
                </div>
            </div>
            <div class="win-actions">
                <button class="win-btn-play" onclick="startActivity('${activityType}')">🔄 Play Again</button>
                <button class="win-btn-home" onclick="goBackToCategory()">🔙 Back</button>
            </div>
        </div>`;
}

// ================= SHOW =================
function show() {
    if (index >= currentSet.length) {
        winSound.play();
        if (isDailyChallenge) {
            const newStreak = updateStreak();
            markDailyDone();
            showWin(true, newStreak);
        } else {
            showWin(false, 0);
        }
        return;
    }

    currentQ = currentSet[index];

    if (isSuddenDeath) {
        const el = document.getElementById("sd-streak");
        if (el) el.innerText = suddenDeathStreak;
    }

    // Visual
    const visualEl = document.getElementById("visual");
    visualEl.classList.remove("pop");
    void visualEl.offsetWidth;

    if (currentQ.isEVS) {
        visualEl.classList.add("evs-visual");
    } else {
        visualEl.classList.remove("evs-visual");
    }

    visualEl.innerHTML = currentQ.visual;
    visualEl.classList.add("pop");

    document.getElementById("question").innerText = currentQ.text;

    // Speak the question
    speak(currentQ.text, currentLang);

    // Build options
    let opts = [currentQ.answer];
    let pool = [];

    if (currentQ.pool) {
        // EVS / structured pool
        pool = currentQ.pool.filter(x => x !== currentQ.answer);
    } else if (currentQ.answer.match(/^[A-Z]$/)) {
        pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    } else if (currentQ.answer.match(/[अ-हक्षत्रज्ञ]/)) {
        pool = ["अ", "आ", "इ", "ई", "उ", "ऊ", "ऋ", "ए", "ऐ", "ओ", "औ",
            "क", "ख", "ग", "घ", "च", "छ", "ज", "झ",
            "ट", "ठ", "ड", "ढ", "त", "थ", "द", "ध",
            "प", "फ", "ब", "भ", "म", "य", "र", "ल", "व",
            "श", "ष", "स", "ह", "क्ष", "त्र", "ज्ञ"];
    } else {
        pool = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", ">", "<", "="];
    }

    while (opts.length < 4) {
        const r = pool[Math.floor(Math.random() * pool.length)];
        if (!opts.includes(r)) opts.push(r);
    }
    opts.sort(() => Math.random() - 0.5);

    const box = document.getElementById("options");
    box.innerHTML = "";
    opts.forEach(o => {
        const b = document.createElement("button");
        b.className = "option";
        b.innerText = o;
        b.onclick = () => {
            speak(o, currentLang);
            setTimeout(() => check(b, o), 250);
        };
        box.appendChild(b);
    });

    document.getElementById("progress").innerText = `${index + 1}/${currentSet.length}`;
    document.getElementById("progressFill").style.width =
        ((index + 1) / currentSet.length * 100) + "%";
}

// ================= CHECK =================
function check(btn, val) {
    document.querySelectorAll(".option").forEach(b => b.onclick = null);

    if (val === currentQ.answer) {
        btn.classList.add("correct");
        score += 10;
        levelCheck();
        correctSound.play();
        speak("Correct! Well done!", "en-IN");
        document.getElementById("score").innerText = score;
        if (isSuddenDeath) suddenDeathStreak++;
        setTimeout(() => { index++; show(); }, 900);

    } else {
        btn.classList.add("wrong");
        document.querySelectorAll(".option").forEach(b => {
            if (b.innerText === currentQ.answer) b.classList.add("correct");
        });

        wrongSound.play();
        speak(`Oops! The answer is ${currentQ.answer}`, "en-IN");

        if (isSuddenDeath) {
            saveSDBest(window._lastGameType, suddenDeathStreak);
            setTimeout(() => showLightningOver(), 1200);
            return;
        }

        score = Math.max(0, score - 2);
        document.getElementById("score").innerText = score;

        setTimeout(() => {
            btn.classList.remove("wrong");
            document.querySelectorAll(".option").forEach(b => {
                b.classList.remove("correct");
                b.onclick = () => { speak(b.innerText, currentLang); setTimeout(() => check(b, b.innerText), 250); };
            });
        }, 1000);
    }
}

// ================= LIGHTNING OVER =================
function showLightningOver() {
    const best = getSDBest(window._lastGameType);
    const isNewBest = suddenDeathStreak >= best;
    document.getElementById("visual").style.display = "none";
    document.getElementById("options").innerHTML = "";
    speak(`Game over! You answered ${suddenDeathStreak} in a row!`);
    document.getElementById("question").innerHTML = `
        <div class="win-screen">
            <span class="win-trophy">⚡</span>
            <div class="win-title" style="color:#e67e22">Lightning Over!</div>
            <div class="win-subtitle">You answered <b>${suddenDeathStreak}</b> in a row!
                ${isNewBest && suddenDeathStreak > 0 ? '<br><span style="color:#27ae60;font-weight:700">🏆 New Best!</span>' : ""}
            </div>
            <div class="win-badges">
                <div class="win-badge gold">
                    <span class="badge-label">⚡ This Run</span>
                    <span class="badge-value">${suddenDeathStreak}</span>
                </div>
                <div class="win-badge purple">
                    <span class="badge-label">🏆 Best</span>
                    <span class="badge-value">${best}</span>
                </div>
            </div>
            <div class="win-actions">
                <button class="win-btn-play" onclick="startSuddenDeath('${window._lastGameType}')">⚡ Try Again</button>
                <button class="win-btn-home" onclick="goHome()">🏠 Home</button>
            </div>
        </div>`;
}

// ================= WIN SCREEN =================
function showWin(isDaily, newStreak) {
    const stars = calcStars(score, currentSet.length);
    saveStars(window._lastGameType, stars);

    const confettiEmojis = ["⭐", "🎉", "✨", "🌟", "🎊", "💫", "🏅", "🎈"];
    const confettiHTML = Array.from({ length: 12 }, (_, i) => {
        const emoji = confettiEmojis[i % confettiEmojis.length];
        const left = Math.random() * 90 + 5;
        const delay = (Math.random() * 0.8).toFixed(2);
        return `<span style="left:${left}%;animation-delay:${delay}s">${emoji}</span>`;
    }).join("");

    const streakMsg = isDaily
        ? `<div class="win-streak-msg">🔥 ${newStreak} day streak! Keep it up!</div>` : "";

    speak(`Congratulations! You got ${score} points!`);

    document.getElementById("visual").style.display = "none";
    document.getElementById("options").innerHTML = "";
    document.getElementById("question").innerHTML = `
        <div class="win-screen">
            <div class="win-confetti">${confettiHTML}</div>
            <span class="win-trophy">🏆</span>
            <div class="win-title">🎉 You Did It!</div>
            <div class="win-stars">${starsHTML(stars)}</div>
            ${streakMsg}
            <div class="win-badges">
                <div class="win-badge gold">
                    <span class="badge-label">⭐ Score</span>
                    <span class="badge-value">${score}</span>
                </div>
                <div class="win-badge purple">
                    <span class="badge-label">🧠 Level</span>
                    <span class="badge-value">${level}</span>
                </div>
            </div>
            <div class="win-actions">
                ${!isDaily ? `<button class="win-btn-play" onclick="startGame(window._lastGameType)">🔄 Play Again</button>` : ""}
                <button class="win-btn-home" onclick="goHome()">🏠 Home</button>
            </div>
        </div>`;
}

// ================= LEVEL =================
function levelCheck() {
    const newLevel = Math.floor(score / 50) + 1;
    if (newLevel !== level) {
        level = newLevel;
        document.getElementById("level").innerText = level;
        speak(`Level ${level}!`);
    }
}

// ================= GO BACK TO CATEGORY =================
function goBackToCategory() {
    synth && synth.cancel();
    currentSet = []; currentQ = null;
    index = 0; score = 0;
    isSuddenDeath = false; isDailyChallenge = false;
    suddenDeathStreak = 0; currentTheme = "";
    activitySet = []; activityIndex = 0; activityScore = 0;

    document.getElementById("game").classList.remove("theme-eng", "theme-hin", "theme-mat", "theme-evs", "theme-act");
    document.getElementById("visual").style.display = "";
    document.getElementById("visual").classList.remove("evs-visual");
    document.getElementById("options").className = "options";

    if (window._lastCategory) {
        openCategory(window._lastCategory);
    } else {
        renderSubjects();
    }
}

// ================= GO HOME =================
function goHome() {
    synth && synth.cancel();
    currentSet = []; currentQ = null;
    index = 0; score = 0;
    isSuddenDeath = false; isDailyChallenge = false;
    suddenDeathStreak = 0; currentTheme = "";
    activitySet = []; activityIndex = 0; activityScore = 0;

    document.getElementById("game").classList.remove("theme-eng", "theme-hin", "theme-mat", "theme-evs", "theme-act");
    document.getElementById("visual").style.display = "";
    document.getElementById("visual").classList.remove("evs-visual");
    document.getElementById("options").className = "options";
    document.getElementById("category").innerHTML = "";
    document.getElementById("subjects").innerHTML = "";

    renderHome();
}

// ================= INIT =================
function initApp() {
    const splash = document.getElementById("splash-overlay");
    if (splash) {
        // Wait 2.8s so all animations play, then fade out over 0.6s
        setTimeout(function () {
            splash.style.opacity = "0";
            setTimeout(function () {
                splash.style.display = "none";
                renderHome();
            }, 550);
        }, 5000);
    } else {
        renderHome();
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}