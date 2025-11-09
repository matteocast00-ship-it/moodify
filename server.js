import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- CONFIGURAZIONE SPOTIFY ---
const clientId = "83f4830f9c104eaeb9a899c93dd69514";
const redirectUri = "https://matteocast00-ship-it.github.io/moodify/callback.html";

// =======================
// Endpoint PKCE: riceve code + verifier e restituisce token
// =======================
app.post("/callback", async (req, res) => {
  try {
    const { code, codeVerifier } = req.body;
    if (!code || !codeVerifier)
      return res.status(400).json({ error: "Parametri mancanti" });

    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const data = await tokenResponse.json();
    if (!tokenResponse.ok) return res.status(tokenResponse.status).json(data);

    res.json(data); // ritorna access_token + refresh_token
  } catch (err) {
    console.error("Errore /callback:", err);
    res.status(500).json({ error: "Errore server interno" });
  }
});

app.post("/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: "refresh_token mancante" });

    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token
      }),
    });

    const data = await tokenResponse.json();
    if (!tokenResponse.ok) return res.status(tokenResponse.status).json(data);

    res.json(data); // ritorna il nuovo access_token
  } catch (err) {
    console.error("Errore /refresh:", err);
    res.status(500).json({ error: "Errore server interno" });
  }
});

// =======================
// Endpoint: ricerca dinamica playlist per mood/genere
// =======================
app.get("/api/search/playlists", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token mancante" });

  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Parametro 'q' mancante" });

  try {
    const spotifyRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=10`,
      {
        headers: { Authorization: "Bearer " + token }
      }
    );

    if (!spotifyRes.ok) {
      const errData = await spotifyRes.json();
      return res.status(spotifyRes.status).json(errData);
    }

    const data = await spotifyRes.json();
    res.json(data.playlists); // ritorna solo la parte delle playlist
  } catch (err) {
    console.error("Errore /api/search/playlists:", err);
    res.status(500).json({ error: "Errore server interno" });
  }
});

// =======================
// Endpoint: ricerca tracce per playlist (opzionale)
// =======================
app.get("/api/playlist/:playlistId/tracks", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token mancante" });

  const { playlistId } = req.params;

  try {
    const spotifyRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=10`,
      {
        headers: { Authorization: "Bearer " + token },
      }
    );

    if (!spotifyRes.ok) {
      const errData = await spotifyRes.json();
      return res.status(spotifyRes.status).json(errData);
    }

    const data = await spotifyRes.json();
    res.json({ tracks: data.items });
  } catch (err) {
    console.error("Errore /api/playlist/tracks:", err);
    res.status(500).json({ error: "Errore server interno" });
  }
});

// =======================
// Avvia server
// =======================
app.listen(3000, () =>
  console.log("✅ Server proxy attivo su http://localhost:3000")
);
