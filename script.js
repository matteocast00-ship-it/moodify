// --- CONFIGURAZIONE SPOTIFY (PKCE) ---
const clientId = "83f4830f9c104eaeb9a899c93dd69514";
const redirectUri = "http://127.0.0.1:5500/callback.html";

// --- ELEMENTI DOM ---
const introScreen = document.getElementById("intro-screen");
const moodScreen = document.getElementById("mood-screen");
const genreScreen = document.getElementById("genre-screen");
const loadingScreen = document.getElementById("loading-screen");
const resultsScreen = document.getElementById("results-screen");

const loginBtn = document.getElementById("loginSpotifyBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userProfileDiv = document.getElementById("userProfile");
const userImage = document.getElementById("userImage");
const welcomeMsg = document.getElementById("welcomeMsg");
const startBtn = document.getElementById("startBtn");

const moodForm = document.getElementById("moodForm");
const genreForm = document.getElementById("genreForm");
const genreSelect = document.getElementById("genre");

const resultsDiv = document.getElementById("results");
const audioEl = document.getElementById("loading-audio");

const playerTitle = document.getElementById("player-title");
const playerArtist = document.getElementById("player-artist");
const playerBtn = document.getElementById("player-btn");

const progressBar = document.getElementById("progress-bar");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");

const customSelect = document.getElementById("moodSelect");
const trigger = customSelect.querySelector(".select-trigger");
const options = customSelect.querySelectorAll(".select-options div");

const customGenreSelect = document.getElementById("genreSelect");
const genreTrigger = customGenreSelect.querySelector(".select-trigger");
const genreOptionsContainer = customGenreSelect.querySelector(".select-options");

let updateInterval = null;

let playerAudio = new Audio();
let isPlaying = false;
let currentAudio = null;

let token = localStorage.getItem("spotify_token");
let selectedMood = null;
let selectedCategoryId = null;

let spotifyPlayer;
let deviceId;
let currentTrackId = null;

let currentTracks = [];  // array di oggetti track
let currentIndex = 0;

// --- REFRESH TOKEN ---
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("spotify_refresh_token");
  if (!refreshToken) return false;

  try {
    const res = await fetch("http://localhost:3000/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!res.ok) return false;
    const data = await res.json();

    if (data.access_token) {
      localStorage.setItem("spotify_token", data.access_token);
      token = data.access_token;
      console.log("🔁 Access token aggiornato!");
      return true;
    }
  } catch (err) {
    console.error("Errore refresh token:", err);
  }
  return false;
}


// --- TOAST ---
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 50);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}


// --- PKCE HELPERS ---
function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(x => chars[x % chars.length])
    .join("");
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


// --- LOGIN ---
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    localStorage.setItem("code_verifier", codeVerifier);

    // Aggiunti gli scopes necessari per Web Playback SDK
    const scopes = [
      "user-read-private",
      "user-read-email",
      "user-library-read",
      "playlist-read-private",
      "playlist-read-collaborative",
      "streaming",
      "user-modify-playback-state",
      "user-read-playback-state"
    ];

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: scopes.join(" "),
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
    });

    window.location = `https://accounts.spotify.com/authorize?${params}`;
  });
}

function initializeSpotifyPlayer() {
  if (!token) return;

  window.onSpotifyWebPlaybackSDKReady = () => {
    spotifyPlayer = new Spotify.Player({
      name: "My Web Player",
      getOAuthToken: cb => cb(token),
      volume: 0.7
    });

    // Eventi di connessione
    spotifyPlayer.addListener("ready", ({ device_id }) => {
      console.log("Device ready", device_id);
      deviceId = device_id;
    });

    spotifyPlayer.addListener("not_ready", ({ device_id }) => {
      console.log("Device not ready", device_id);
    });

    spotifyPlayer.addListener('player_state_changed', state => {
      if (!state) return;

      const track = state.track_window.current_track;
      const titleEl = document.getElementById('player-title');
      const artistEl = document.getElementById('player-artist');
      titleEl.textContent = track.name;
      artistEl.textContent = track.artists.map(a => a.name).join(', ');

      // Applica scorrimento se necessario
      applyScrollIfNeeded(titleEl);
      applyScrollIfNeeded(artistEl);
      currentTrackId = track.id;

      // Aggiorna pulsante play/pausa
      document.getElementById("player-btn").textContent = state.paused ? "▶" : "⏸";

      // Avvia aggiornamento barra di progresso
      startProgressUpdater();

      // Controllo automatico del termine brano
      if (window.autoPlayChecker) clearInterval(window.autoPlayChecker);

      window.autoPlayChecker = setInterval(() => {
        spotifyPlayer.getCurrentState().then(s => {
          if (!s) return;
          const pos = s.position;
          const dur = s.duration;
          const paused = s.paused;

          // Se la canzone è quasi finita (ultimi 500ms)
          if (!paused && pos >= dur - 500) {
            clearInterval(window.autoPlayChecker);
            console.log("Fine brano → passo alla successiva 🎶");
            document.getElementById("next-btn").click();
          }
        });
      }, 1000);
    });

    spotifyPlayer.addListener("initialization_error", ({ message }) => { console.error(message); });
    spotifyPlayer.addListener("authentication_error", ({ message }) => { console.error(message); });
    spotifyPlayer.addListener("account_error", ({ message }) => { console.error(message); });

    spotifyPlayer.connect();
  };

  // Carica l'SDK
  const script = document.createElement("script");
  script.src = "https://sdk.scdn.co/spotify-player.js";
  document.body.appendChild(script);
}

function startProgressUpdater() {
  clearInterval(updateInterval);
  updateInterval = setInterval(async () => {
    if (!spotifyPlayer) return;
    const state = await spotifyPlayer.getCurrentState();
    if (!state || !state.position || !state.duration) return;

    // Aggiorna barra di progresso
    progressBar.value = (state.position / state.duration) * 100;

    // Aggiorna tempo corrente e totale
    const currentSec = Math.floor(state.position / 1000);
    const totalSec = Math.floor(state.duration / 1000);
    document.getElementById("current-time").textContent = formatTime(currentSec);
    document.getElementById("total-time").textContent = formatTime(totalSec);

    // ✅ Controllo per la riproduzione automatica
    // (quando il brano è praticamente finito, simula il click su "next")
    if (!state.paused && state.position >= state.duration - 1000) {
      clearInterval(updateInterval);
      setTimeout(() => {
        nextBtn.click(); // simula il click sul pulsante "Next"
      }, 500);
    }
  }, 500);
}

function formatTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// Spostarsi nella traccia usando la barra
progressBar.addEventListener("input", async (e) => {
  if (!spotifyPlayer) return;
  const newPos = Number(e.target.value); // percentuale 0-100
  const state = await spotifyPlayer.getCurrentState();
  if (!state) return;

  const duration = state.duration; // in ms
  const position = Math.floor((newPos / 100) * duration);
  spotifyPlayer.seek(position).catch(err => console.error("Errore seek:", err));
});

prevBtn.addEventListener("click", async () => {
  if (!spotifyPlayer) return showToast("Mini-player non pronto.", "error");
  if (!currentTracks.length) return showToast("Nessuna traccia disponibile", "info");

  if (currentIndex > 0) {
    currentIndex--;
    const trackUri = `spotify:track:${currentTracks[currentIndex].id}`;
    await playOnSpotify(trackUri);
  } else {
    showToast("Sei alla prima traccia", "info");
  }
});

// NEXT
nextBtn.addEventListener("click", async () => {
  if (!spotifyPlayer) return showToast("Mini-player non pronto.", "error");
  if (!currentTracks.length) return showToast("Nessuna traccia disponibile", "info");

  if (currentIndex < currentTracks.length - 1) {
    currentIndex++;
    const trackUri = `spotify:track:${currentTracks[currentIndex].id}`;
    await playOnSpotify(trackUri);
  } else {
    showToast("Sei all’ultima traccia", "info");
  }
});
if (token) initializeSpotifyPlayer();

// --- FUNZIONE PER RIPRODURRE TRACCE SUL MINI-PLAYER ---
function playOnSpotify(trackUri) {
  if (!deviceId || !token) return showToast("Mini-player non pronto.", "error");

  fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ uris: [trackUri] })
  }).then(res => {
    if (res.status === 204) {
      console.log("Brano avviato su mini-player Spotify");
      document.getElementById('spotify-player').classList.remove('hidden');
    } else {
      console.warn("Errore riproduzione:", res.status);
    }
  }).catch(err => console.error(err));
}

// --- PROFILO UTENTE ---
async function loadUserProfile() {
  try {
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) throw new Error("Impossibile recuperare il profilo utente");
    const userData = await res.json();

    // Mostra immagine e nome utente
    if (userData.images && userData.images.length > 0) {
      userImage.src = userData.images[0].url;
      userImage.classList.remove("hidden");
    }

    welcomeMsg.textContent = `👋 Benvenuto, ${userData.display_name || "Utente"}!`;
    welcomeMsg.classList.add("show");

    // ✅ Mostra profilo + logout, nascondi login
    userProfileDiv.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    loginBtn.classList.add("hidden");

  } catch (err) {
    console.error("Errore nel caricamento del profilo:", err);
    showToast("Errore nel caricamento del profilo utente", "error");
  }
}


// --- LOGOUT ---
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.clear();

    // ✅ Mostra solo il login, nascondi tutto il resto
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userProfileDiv.classList.add("hidden");
    welcomeMsg.textContent = "";

    showToast("Logout effettuato ✅", "success");
  });
}


// --- GESTIONE LOGIN AUTOMATICO ---
window.addEventListener("load", async () => {
  token = localStorage.getItem("spotify_token");

  if (token) {
    // ✅ Utente loggato → mostra profilo + logout, nascondi login
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userProfileDiv.classList.remove("hidden");
    await loadUserProfile();
  } else {
    // 🚪 Nessun token → mostra solo login
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userProfileDiv.classList.add("hidden");
  }
});


// --- SCREEN SWITCH ---
function switchScreen(from, to) {
  if (!from || !to) return;
  from.classList.add("exit-left");

  setTimeout(() => {
    from.classList.add("hidden");
    from.classList.remove("active", "exit-left");
    to.classList.remove("hidden");
    setTimeout(() => {
      to.classList.add("active");

      // Espandi il pannello se siamo su playlist o risultati
      if (to.id === "playlist-screen" || to.id === "results-screen") {
        document.querySelector(".glass-panel").classList.add("expanded");
      } else {
        document.querySelector(".glass-panel").classList.remove("expanded");
      }

    }, 50);
  }, 400);
}


// --- BACK BUTTONS ---
document.querySelectorAll(".back-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const targetId = btn.dataset.back;
    const targetScreen = document.getElementById(targetId);
    const currentScreen = btn.closest(".screen");
    if (targetScreen && currentScreen) {
      switchScreen(currentScreen, targetScreen);
    }
  });
});


// --- START ---
if (startBtn) startBtn.addEventListener("click", () => switchScreen(introScreen, moodScreen));


// --- AUDIO ---
function startEqualizerAudio() {
  if (!audioEl) return;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  audioEl.currentTime = 0;
  audioEl.volume = 0.6;
  audioEl.play().catch(() => console.warn("Autoplay bloccato"));
}
function stopEqualizerAudio() {
  if (audioEl) audioEl.pause();
}


// --- MOOD FORM ---
if (moodForm) {
  moodForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Selezione mood dal menu custom
    if (!selectedMood) {
      showToast("Seleziona un mood!", "error");
      return;
    }

    switchScreen(moodScreen, genreScreen);
    await populateCategories(selectedMood);
  });
}

if (customSelect) {
  const trigger = customSelect.querySelector(".select-trigger");
  const options = customSelect.querySelectorAll(".select-options div");

  trigger.addEventListener("click", () => {
    customSelect.classList.toggle("open");
  });

  options.forEach(opt => {
    opt.addEventListener("click", () => {
      selectedMood = opt.getAttribute("data-value");
      trigger.textContent = opt.textContent;
      customSelect.classList.remove("open");
    });
  });

  // Chiude il menu cliccando fuori
  document.addEventListener("click", e => {
    if (!customSelect.contains(e.target)) {
      customSelect.classList.remove("open");
    }
  });
}



// --- POPOLA CATEGORIE ---
async function populateCategories(mood) {
  genreTrigger.textContent = "-- scegli un genere --";
  genreOptionsContainer.innerHTML = "";
  const moodMap = {
    felice: ["pop", "party", "dance", "indie", "funk"],
    triste: ["acoustic", "soul", "piano", "ballad", "blues"],
    energico: ["rock", "edm", "hiphop", "electronic", "metal"],
    rilassato: ["chill", "jazz", "ambient", "bossa nova", "acoustic"],
    stressato: ["lofi", "chill", "ambient", "focus", "meditation"],
    ansioso: ["piano", "acoustic", "classical", "meditation", "soundtrack"],
    sportivo: ["workout", "power", "trap", "electronic", "motivational"],
    romantico: ["love", "r&b", "soul", "acoustic", "slow"],
    nostalgico: ["retro", "oldies", "classic rock", "80s", "90s"],
    concentrato: ["focus", "study", "instrumental", "lofi", "ambient"],
    festaiolo: ["party", "dance", "club", "latin", "pop"],
    arrabbiato: ["metal", "hard rock", "punk", "rap", "grunge"],
    meditativo: ["meditation", "yoga", "nature", "ambient", "chill"],
    creativo: ["indie", "alternative", "experimental", "lofi", "electronic"],
    stanco: ["chillout", "soft pop", "jazz lounge", "indie chill", "lo-fi beats"],
    ko: ["dream pop", "sleep music", "chillhop", "deep house", "dark ambient"]
  };

  const keywords = moodMap[mood] || ["pop"];
  populateGenreSelect(keywords);
}

function populateGenreSelect(genres) {
  genreOptionsContainer.innerHTML = "";
  genres.forEach(g => {
    const div = document.createElement("div");
    div.textContent = g.charAt(0).toUpperCase() + g.slice(1);
    div.dataset.value = g;
    genreOptionsContainer.appendChild(div);
  });

  // click su ogni genere
  genreOptionsContainer.querySelectorAll("div").forEach(opt => {
    opt.addEventListener("click", () => {
      selectedCategoryId = opt.dataset.value;
      genreTrigger.textContent = opt.textContent;
      customGenreSelect.classList.remove("open");
    });
  });
}

genreTrigger.addEventListener("click", () => {
  customGenreSelect.classList.toggle("open");
});

document.addEventListener("click", e => {
  if (!customGenreSelect.contains(e.target)) {
    customGenreSelect.classList.remove("open");
  }
});

// --- SCORRIMENTO TESTO ARTISTA/TITOLO ---
function applyScrollIfNeeded(element) {
  if (!element) return;
  element.classList.remove("scroll-text");
  element.style.animation = "none";
  void element.offsetWidth; // forza reflow
  element.style.animation = null;

  if (element.scrollWidth > element.clientWidth + 10) {
    element.classList.add("scroll-text");
  }
}

// --- GENRE FORM ---
if (genreForm) {
  genreForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Se non è selezionato nulla nel custom select
    if (!selectedCategoryId) {
      showToast("Seleziona un genere!", "error");
      return;
    }

    switchScreen(genreScreen, loadingScreen);
    startEqualizerAudio();

    setTimeout(async () => {
      stopEqualizerAudio();
      switchScreen(loadingScreen, resultsScreen);
      await showPlaylists(selectedCategoryId);
    }, 2000);
  });
}


// --- MOSTRA PLAYLISTS ---
/*async function showPlaylists(categoryId) {
  if (!resultsDiv) return;
  resultsDiv.innerHTML = "<p class='subtitle'>🎧 Carico playlist...</p>";

  if (!token) return showToast("Token mancante, effettua nuovamente il login.", "error");

  try {
    // 🎯 Chiamata diretta all'API di Spotify
    let res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(categoryId)}&type=playlist&limit=20`, {
      headers: { Authorization: "Bearer " + token }
    });

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(categoryId)}&type=playlist&limit=20`, {
          headers: { Authorization: "Bearer " + token }
        });
      } else return showToast("Sessione scaduta. Effettua di nuovo il login.", "error");
    }

    const data = await res.json();
    const playlists = data.playlists?.items || [];

    if (!playlists.length) {
      resultsDiv.innerHTML = "<p class='subtitle'>😔 Nessuna playlist trovata.</p>";
      return;
    }

    resultsDiv.innerHTML = "";
    playlists.forEach(pl => {
      if (!pl || !pl.name) return;

      const imageUrl = pl.images && pl.images.length > 0 ? pl.images[0].url : "https://via.placeholder.com/60x60?text=♪";

      const plCard = document.createElement("div");
      plCard.className = "playlist-card";
      plCard.innerHTML = `
    <img src="${imageUrl}" alt="${pl.name}">
    <div class="playlist-info">
      <strong>${pl.name}</strong>
      <p>${pl.description ? pl.description.substring(0, 60) + "..." : ""}</p>
    </div>
  `;

      resultsDiv.appendChild(plCard);

      plCard.addEventListener("click", async () => {
        resultsDiv.innerHTML = "<p class='subtitle'>🎶 Carico brani...</p>";

        try {
          const tracksRes = await fetch(`https://api.spotify.com/v1/playlists/${pl.id}/tracks?limit=10`, {
            headers: { Authorization: "Bearer " + token }
          });
          const tracksData = await tracksRes.json();

          resultsDiv.innerHTML = "";
          tracksData.items.forEach(item => {
            const track = item.track;
            if (!track || !track.name) return;

            appendTrackToResults(
              track.name,
              track.artists?.[0]?.name || "Artista sconosciuto",
              track.album?.images?.[0]?.url || "",
              track.preview_url,
              track.duration_ms
            );
          });
        } catch (err) {
          console.error(err);
          showToast("Errore caricamento brani", "error");
        }
      });
    });

  } catch (err) {
    console.error(err);
    showToast("Errore caricamento playlist", "error");
  }
}*/

async function showPlaylists(categoryId) {
  if (!resultsDiv) return;
  resultsDiv.innerHTML = `
    <div class="playlist-container">
      <div id="playlists" class="playlists-list"><p class="subtitle">🎧 Carico playlist...</p></div>
      <div id="tracks" class="tracks-list"><p class="subtitle">🎵 Seleziona una playlist</p></div>
    </div>
  `;

  const playlistsList = resultsDiv.querySelector("#playlists");
  const tracksList = resultsDiv.querySelector("#tracks");

  if (!token) return showToast("Token mancante, effettua nuovamente il login.", "error");

  try {
    let res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(categoryId)}&type=playlist&limit=20`, {
      headers: { Authorization: "Bearer " + token }
    });

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(categoryId)}&type=playlist&limit=20`, {
          headers: { Authorization: "Bearer " + token }
        });
      } else return showToast("Sessione scaduta. Effettua di nuovo il login.", "error");
    }

    const data = await res.json();
    const playlists = data.playlists?.items?.filter(p => p && p.name) || [];

    if (!playlists.length) {
      playlistsList.innerHTML = "<p class='subtitle'>😔 Nessuna playlist trovata.</p>";
      return;
    }

    playlistsList.innerHTML = "";
    playlists.forEach(pl => {
      const img = (pl.images && pl.images.length > 0 && pl.images[0]?.url)
        ? pl.images[0].url
        : "https://via.placeholder.com/60x60?text=♪";

      const card = document.createElement("div");
      card.className = "playlist-card";
      card.innerHTML = `
        <img src="${img}" alt="${pl.name || "Playlist"}">
        <div>
          <strong>${pl.name || "Senza titolo"}</strong>
          <p>${pl.description ? pl.description.substring(0, 60) + "..." : ""}</p>
        </div>
      `;
      playlistsList.appendChild(card);

      card.addEventListener("click", async () => {
        const isMobile = window.innerWidth <= 768; // rileva mobile
        const allCards = document.querySelectorAll(".playlist-card");
        if (isMobile && card.classList.contains("selected")) {
          card.classList.remove("selected");
          allCards.forEach(c => {
            c.style.display = "flex";
            c.classList.remove("selected");
          });
          tracksList.classList.add("hidden");
          tracksList.innerHTML = "<p class='subtitle'>🎵 Seleziona una playlist</p>";
          return;
        }

        allCards.forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        tracksList.classList.remove("hidden");
        tracksList.innerHTML = "<p class='subtitle'>🎶 Carico brani...</p>";

        // Su mobile, mostra solo la playlist selezionata
        if (isMobile) {
          allCards.forEach(c => (c.style.display = "none"));
          card.style.display = "flex";
        }

        try {
          const tracksRes = await fetch(`https://api.spotify.com/v1/playlists/${pl.id}/tracks?limit=50`, {
            headers: { Authorization: "Bearer " + token }
          });
          const tracksData = await tracksRes.json();
          const items = tracksData.items || [];

          if (!items.length) {
            tracksList.innerHTML = "<p class='subtitle'>Nessun brano disponibile.</p>";
            return;
          }

          currentTracks = items.map(item => item.track).filter(t => t && t.id);
          currentIndex = 0;

          // Mostra le tracce
          tracksList.innerHTML = "";
          currentTracks.forEach(t => {
            const imgUrl = t.album?.images?.[0]?.url || "https://via.placeholder.com/60x60?text=♫";
            appendTrackToResults(
              t.name,
              t.artists?.[0]?.name || "Artista sconosciuto",
              imgUrl,
              t.id,
              t.duration_ms,
              tracksList
            );
          });

          // Riproduci la prima traccia automaticamente


        } catch (err) {
          console.error(err);
          showToast("Errore caricamento brani", "error");
        }
      });
    });
  } catch (err) {
    console.error(err);
    showToast("Errore caricamento playlist", "error");
  }
}


// --- CARD BRANO ---
function appendTrackToResults(title, artist, image, trackId, durationMs, container) {
  const trackEl = document.createElement("div");
  trackEl.classList.add("track");
  const imgUrl = image || "https://via.placeholder.com/60x60?text=♫";

  let durationText = "";
  if (typeof durationMs === "number") {
    const min = Math.floor(durationMs / 60000);
    const sec = Math.floor((durationMs % 60000) / 1000);
    durationText = `${min}:${sec.toString().padStart(2, '0')}`;
  }

  trackEl.innerHTML = `
    <img src="${imgUrl}" alt="${title}">
    <div class="track-info">
      <strong>${title}</strong><br>
      <span>${artist}</span><br>
      <small>${durationText}</small>
    </div>
    <button class="play-btn">▶</button>
  `;

  container.appendChild(trackEl);

  const playBtn = trackEl.querySelector(".play-btn");
  playBtn.addEventListener("click", () => {
    document.getElementById("spotify-player").style.display = "flex";
    if (!trackId) return showToast("Traccia non disponibile 😢", "info");

    // Avvia la riproduzione SOLO quando l’utente clicca
    const trackUri = `spotify:track:${trackId}`;
    playOnSpotify(trackUri);
  });
}

// --- PULSANTE PLAY/PAUSA MINI-PLAYER ---
document.getElementById('player-btn').addEventListener("click", async () => {
  if (!spotifyPlayer) return showToast("Mini-player non pronto.", "error");

  try {
    const state = await spotifyPlayer.getCurrentState();
    if (!state) return showToast("Nessun brano in riproduzione.", "info");

    spotifyPlayer.togglePlay();
  } catch (err) {
    console.error("Errore toggle play:", err);
    showToast("Impossibile cambiare lo stato di riproduzione.", "error");
  }
});

// Chiudi il player e ferma il brano
document.getElementById("player-close").addEventListener("click", async () => {
  if (spotifyPlayer) {
    await spotifyPlayer.pause();  // ferma la riproduzione
  }
  document.getElementById("spotify-player").style.display = "none";
});

function applyScrollIfNeeded(element) {
  if (!element) return;

  // Reset animazione
  element.classList.remove("scroll-text");
  element.style.animation = "none";
  void element.offsetWidth; // forza reflow
  element.style.animation = null;

  // Se il testo è più largo del contenitore → scorrimento
  if (element.scrollWidth > element.clientWidth + 10) {
    element.classList.add("scroll-text");
  }
}

