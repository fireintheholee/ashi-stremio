const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const fetch = require("node-fetch");
// ─── Constants ────────────────────────────────────────────────────────────────
const DENO_PROXY = "https://deno-proxies-sznvnpnxwhbv.deno.dev/?url=";
const ANIMEKAI_BASE = "https://anikai.to";
const ONEMOVIES_BASE = "https://1movies.bz";
const ENC_API = "https://enc-dec.app/api";
const TMDB_KEY = "9801b6b0548ad57581d111ea690c85c8";
const TMDB_BASE = "https://api.themoviedb.org/3";
function proxyUrl(url) {
    return DENO_PROXY + encodeURIComponent(url);
}
// ─── Manifest ─────────────────────────────────────────────────────────────────
const manifest = {
    id: "org.ashi.stremio",
    version: "1.3.0",
    name: "Ashi (あし) - Literally Everything",
    description: "Anime, Movies & TV Shows from AnimeKai and 1Movies. Sub, Dub & Softsub supported.",
    logo: "https://files.catbox.moe/ptq3a5.png",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    catalogs: [
        { type: "series", id: "ashi-anime-popular",   name: "Ashi — Popular Anime",         extra: [{ name: "skip" }] },
        { type: "series", id: "ashi-anime-top",       name: "Ashi — Top Rated Anime",       extra: [{ name: "skip" }] },
        { type: "movie",  id: "ashi-movies-popular",  name: "Ashi — Popular Movies",        extra: [{ name: "skip" }] },
        { type: "movie",  id: "ashi-movies-top",      name: "Ashi — Top Rated Movies",      extra: [{ name: "skip" }] },
        { type: "series", id: "ashi-tv-popular",      name: "Ashi — Popular TV Shows",      extra: [{ name: "skip" }] },
        { type: "series", id: "ashi-tv-top",          name: "Ashi — Top Rated TV Shows",    extra: [{ name: "skip" }] },
    ],
    idPrefixes: ["tt", "tmdb:", "ashi:"]
};
const builder = new addonBuilder(manifest);
// ─── Helpers ──────────────────────────────────────────────────────────────────
async function tmdbFetch(path) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${TMDB_KEY}&include_adult=false`);
}
    return res.json();
async function tmdbIdFromImdb(imdbId) {
    const data = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
    return { movie: data.movie_results?.[0], tv: data.tv_results?.[0] };
}
function decodeHtmlEntities(str) {
    if (!str) return str;
    return str
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}
function cleanJsonHtml(s) {
    if (!s) return "";
    return s.replace(/\\"/g, '"').replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\").replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t").replace(/\\r/g, "\r");
}
function movieMeta(item) {
    return {
        id: `tmdb:movie:${item.id}`,
        type: "movie",
        name: item.title || item.original_title || "Untitled",
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
        background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : undefined,
        description: item.overview || "",
        releaseInfo: item.release_date?.split("-")[0],
        imdbRating: item.vote_average?.toFixed(1)
    };
}
function tvMeta(item) {
    return {
        id: `tmdb:tv:${item.id}`,
        type: "series",
        name: item.name || item.original_name || "Untitled",
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
        background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : undefined,
        description: item.overview || "",
        releaseInfo: item.first_air_date?.split("-")[0],
        imdbRating: item.vote_average?.toFixed(1)
    };
}
// ─── AnimeKai Stream Extraction ───────────────────────────────────────────────
async function encKai(text) {
    const res = await fetch(`${ENC_API}/enc-kai?text=${encodeURIComponent(text)}`);
    const json = await res.json();
    return json.result;
}
async function decKai(text) {
    const res = await fetch(`${ENC_API}/dec-kai?text=${encodeURIComponent(text)}`);
    const json = await res.json();
    return json.result;
}
async function decMega(encResult, userAgent) {
    const res = await fetch(`${ENC_API}/dec-mega`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: encResult, agent: userAgent })
    });
    const json = await res.json();
    return json?.result?.sources?.[0]?.file || null;
}
async function getAnimekaiEpisodeList(animePageUrl) {
    const res = await fetch(proxyUrl(animePageUrl));
    const html = await res.text();
    const animeId = (html.match(/<div class="rate-box"[^>]*data-id="([^"]+)"/) || [])[1];
    if (!animeId) return [];
    const token = await encKai(animeId);
    const epListRes = await fetch(proxyUrl(`${ANIMEKAI_BASE}/ajax/episodes/list?ani_id=${animeId}&_=${token}`));
    const epListData = await epListRes.json();
    const cleanedHtml = cleanJsonHtml(epListData.result);
    const episodeRegex = /<a[^>]+num="([^"]+)"[^>]+token="([^"]+)"[^>]*>/g;
    const matches = [...cleanedHtml.matchAll(episodeRegex)];
    return matches.map(([_, num, tok]) => ({
        number: parseInt(num, 10),
        token: tok
    }));
}
async function getAnimekaiStream(episodeToken) {
    const encryptedToken = await encKai(episodeToken);
    const url = `${ANIMEKAI_BASE}/ajax/links/list?token=${episodeToken}&_=${encryptedToken}`;
    const res = await fetch(proxyUrl(url));
    const text = await res.text();
    let ajaxHtml = "";
    try { ajaxHtml = cleanJsonHtml(JSON.parse(text)?.result || ""); } catch {}
    const serverHtml = ajaxHtml || cleanJsonHtml(text);
    const extractServerId = (section) => {
        if (!section) return null;
        const preferred = /<span class="server"[^>]*data-lid="([^"]+)"[^>]*>\s*Server\s*1\s*<\/span>/i.exec(section);
        if (preferred?.[1]) return preferred[1];
        const fallback = /<span class="server"[^>]*data-lid="([^"]+)"/i.exec(section);
        return fallback?.[1] || null;
    };
    const subContent     = (/<div class="server-items lang-group" data-id="sub"[^>]*>([\s\S]*?)<\/div>/.exec(serverHtml) || [])[1] || "";
    const softsubContent = (/<div class="server-items lang-group" data-id="softsub"[^>]*>([\s\S]*?)<\/div>/.exec(serverHtml) || [])[1] || "";
    const dubContent     = (/<div class="server-items lang-group" data-id="dub"[^>]*>([\s\S]*?)<\/div>/.exec(serverHtml) || [])[1] || "";
    const serverIds = {
        Sub:     extractServerId(subContent),
        Softsub: extractServerId(softsubContent),
        Dub:     extractServerId(dubContent)
    };
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
    const streamResults = await Promise.all(
        Object.entries(serverIds)
            .filter(([, id]) => id)
            .map(async ([type, serverId]) => {
                try {
                    const encId = await encKai(serverId);
                    const viewRes = await fetch(proxyUrl(`${ANIMEKAI_BASE}/ajax/links/view?id=${serverId}&_=${encId}`));
                    const viewJson = await viewRes.json();
                    const decrypted = await decKai(viewJson.result);
                    const parsed = typeof decrypted === "string" ? JSON.parse(decrypted) : decrypted;
                    const embedUrl = parsed?.url;
                    if (!embedUrl) return null;
                    const mediaRes = await fetch(embedUrl.replace("/e/", "/media/"), {
                        headers: { "Referer": `${ANIMEKAI_BASE}/`, "User-Agent": UA }
                    });
                    const mediaJson = await mediaRes.json();
                    const streamUrl = await decMega(mediaJson?.result, UA);
                    if (!streamUrl) return null;
                    return { type, streamUrl };
                } catch (e) {
                    console.error(`Animekai ${type} stream error:`, e.message);
                    return null;
                }
            })
    );
    return streamResults.filter(Boolean).map(({ type, streamUrl }) => ({
        name: "AnimeKai",
        title: type === "Dub" ? "
        url: streamUrl,
 Dubbed" : type === "Softsub" ? " Original Audio" : " Hardsub English",
        behaviorHints: { bingeGroup: "ashi-animekai" }
    }));
}
// ─── 1Movies Stream Extraction ────────────────────────────────────────────────
async function encMovies(text) {
    const res = await fetch(`${ENC_API}/enc-movies-flix?text=${encodeURIComponent(text)}`);
    const json = await res.json();
    return json.result;
}
async function getOneMoviesStream(episodeId) {
    const encId = await encMovies(episodeId);
    const url = `${ONEMOVIES_BASE}/ajax/links/list?eid=${episodeId}&_=${encId}`;
    const res = await fetch(proxyUrl(url));
    const data = await res.json();
    const cleanedHtml = cleanJsonHtml(data.result);
    const server1Match = /<div class="server wnav-item"[^>]*data-lid="([^"]+)"[^>]*>\s*<span>Server 1<\/span>/.exec(cleanedHtml);
    if (!server1Match) return [];
    const serverId = server1Match[1];
    const serverToken = await encMovies(serverId);
    const streamRes = await fetch(proxyUrl(`${ONEMOVIES_BASE}/ajax/links/view?id=${serverId}&_=${serverToken}`));
    const streamData = await streamRes.json();
    if (!streamData.result) return [];
    const decryptRes = await fetch(`${ENC_API}/dec-movies-flix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: streamData.result })
    });
    const decryptData = await decryptRes.json();
    const decryptedUrl = decryptData.result?.url;
    if (!decryptedUrl) return [];
    // Subtitles
    let englishSubUrl = "";
    try {
        const subListEncoded = decryptedUrl.split("sub.list=")[1]?.split("&")[0];
        if (subListEncoded) {
            const subRes = await fetch(decodeURIComponent(subListEncoded));
            const subs = await subRes.json();
            englishSubUrl = Array.isArray(subs)
                ? (subs.find(s => s.label === "English")?.file?.replace(/\\\//g, "/") || "")
                : "";
        }
    } catch {}
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
    const mediaRes = await fetch(decryptedUrl.replace("/e/", "/media/"), {
        headers: { "Referer": `${ONEMOVIES_BASE}/`, "User-Agent": UA }
    });
    const mediaJson = await mediaRes.json();
    if (!mediaJson?.result) return [];
    const finalRes = await fetch(`${ENC_API}/dec-rapid?text=${encodeURIComponent(mediaJson.result)}&agent=${encodeURIComponent(UA)}`);
    const finalJson = await finalRes.json();
    const m3u8Link = finalJson?.result?.sources?.[0]?.file;
    if (!m3u8Link) return [];
    const m3u8Res = await fetch(m3u8Link);
    const m3u8Text = await m3u8Res.text();
    const baseUrl = m3u8Link.substring(0, m3u8Link.lastIndexOf('/') + 1);
    const streams = [];
    const lines = m3u8Text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            const quality = resMatch ? `${resMatch[1].split('x')[1]}p` : 'Auto';
            const streamPath = lines[i + 1]?.trim();
            if (streamPath) {
                streams.push({
                    name: "1Movies",
                    title: ` ${quality}`,
                    url: baseUrl + streamPath,
                    subtitles: englishSubUrl ? [{ url: englishSubUrl, lang: "English" }] : [],
                    behaviorHints: { bingeGroup: "ashi-1movies" }
                });
            }
        }
    }
    return streams;
}
// ─── Catalog ──────────────────────────────────────────────────────────────────
builder.defineCatalogHandler(async ({ type, id, extra }) => {
    const page = extra?.skip ? Math.floor(extra.skip / 20) + 1 : 1;
    const endpoints = {
        "ashi-anime-popular":  `/tv/popular?page=${page}`,
        "ashi-anime-top":      `/tv/top_rated?page=${page}`,
        "ashi-movies-popular": `/movie/popular?page=${page}`,
        "ashi-movies-top":     `/movie/top_rated?page=${page}`,
        "ashi-tv-popular":     `/tv/popular?page=${page}`,
        "ashi-tv-top":         `/tv/top_rated?page=${page}`,
    };
    const endpoint = endpoints[id];
    if (!endpoint) return { metas: [] };
    const data = await tmdbFetch(endpoint);
    const results = data.results || [];
    const metas = results.map(item => type === "movie" ? movieMeta(item) : tvMeta(item));
    return { metas };
});
// ─── Meta ─────────────────────────────────────────────────────────────────────
builder.defineMetaHandler(async ({ type, id }) => {
    let tmdbId = null;
    if (id.startsWith("tmdb:")) {
        tmdbId = id.split(":")[2];
    } else if (id.startsWith("tt")) {
        const found = await tmdbIdFromImdb(id);
        tmdbId = type === "movie" ? found.movie?.id : found.tv?.id;
    }
    if (!tmdbId) return { meta: null };
    if (type === "movie") {
        const data = await tmdbFetch(`/movie/${tmdbId}`);
        return { meta: movieMeta(data) };
    } else {
        const data = await tmdbFetch(`/tv/${tmdbId}`);
        const meta = tvMeta(data);
        const videos = [];
        for (const season of (data.seasons || [])) {
            if (season.season_number === 0) continue;
            const seasonData = await tmdbFetch(`/tv/${tmdbId}/season/${season.season_number}`);
            for (const ep of (seasonData.episodes || [])) {
                videos.push({
                    id: `tmdb:tv:${tmdbId}:${season.season_number}:${ep.episode_number}`,
                    title: ep.name || `Episode ${ep.episode_number}`,
                    season: season.season_number,
                    episode: ep.episode_number,
                    released: ep.air_date ? new Date(ep.air_date) : undefined,
                    thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : undefined,
                    overview: ep.overview || ""
                });
            }
        }
        meta.videos = videos;
        return { meta };
    }
});
// ─── Streams ──────────────────────────────────────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
    try {
        let tmdbId, season, episode;
        if (id.startsWith("tmdb:")) {
            const parts = id.split(":");
            tmdbId = parts[2];
            season = parts[3];
            episode = parts[4];
        } else if (id.startsWith("tt")) {
            const parts = id.split(":");
            const found = await tmdbIdFromImdb(parts[0]);
            tmdbId = type === "movie" ? found.movie?.id : found.tv?.id;
            season = parts[1];
            episode = parts[2];
        }
        if (!tmdbId) return { streams: [] };
        let streams = [];
        if (type === "movie") {
            // Search TMDB for title, then search AnimeKai/1Movies
            const tmdbData = await tmdbFetch(`/movie/${tmdbId}`);
            const title = tmdbData.title || tmdbData.original_title;
            // Try 1Movies
            try {
                const searchRes = await fetch(proxyUrl(`${ONEMOVIES_BASE}/browser?keyword=${encodeURIComponent(title)}`));
                const searchHtml = await searchRes.text();
                const hrefMatch = searchHtml.match(/href="([^"]*)" class="poster"/);
                if (hrefMatch) {
                    const moviePageUrl = hrefMatch[1].startsWith("http") ? hrefMatch[1] : ONEMOVIES_BASE + hrefMatch[1];
                    const moviePageRes = await fetch(proxyUrl(moviePageUrl));
                    const movieHtml = await moviePageRes.text();
                    const movieIdMatch = movieHtml.match(/<div class="detail-lower"[^>]*id="movie-rating"[^>]*data-id="([^"]+)"/);
                    if (movieIdMatch) {
                        const oneStreams = await getOneMoviesStream(movieIdMatch[1]);
                        streams = streams.concat(oneStreams);
                    }
                }
            } catch (e) {
                console.error("1Movies movie stream error:", e.message);
            }
        } else {
            // TV/Anime episode
            const tmdbData = await tmdbFetch(`/tv/${tmdbId}`);
            const title = tmdbData.name || tmdbData.original_name;
            // Try AnimeKai first (good for anime)
            try {
                const searchRes = await fetch(proxyUrl(`${ANIMEKAI_BASE}/browser?keyword=${encodeURIComponent(title)}`));
                const searchHtml = await searchRes.text();
                const hrefMatch = searchHtml.match(/href="([^"]*)" class="poster"/);
                if (hrefMatch) {
                    const animePageUrl = hrefMatch[1].startsWith("http") ? hrefMatch[1] : ANIMEKAI_BASE + hrefMatch[1];
                    const episodes = await getAnimekaiEpisodeList(animePageUrl);
                    const epNum = parseInt(episode);
                    const targetEp = episodes.find(e => e.number === epNum);
                    if (targetEp) {
                        const akStreams = await getAnimekaiStream(targetEp.token);
                }
                    }
                        streams = streams.concat(akStreams);
            } catch (e) {
                console.error("AnimeKai stream error:", e.message);
            }
            // Try 1Movies as fallback
            try {
                const searchRes = await fetch(proxyUrl(`${ONEMOVIES_BASE}/browser?keyword=${encodeURIComponent(title)}`));
                const searchHtml = await searchRes.text();
                const hrefMatch = searchHtml.match(/href="([^"]*)" class="poster"/);
                if (hrefMatch) {
                    const showPageUrl = hrefMatch[1].startsWith("http") ? hrefMatch[1] : ONEMOVIES_BASE + hrefMatch[1];
                    const showPageRes = await fetch(proxyUrl(showPageUrl));
                    const showHtml = await showPageRes.text();
                    const movieIdMatch = showHtml.match(/<div class="detail-lower"[^>]*id="movie-rating"[^>]*data-id="([^"]+)"/);
                    if (movieIdMatch) {
                        const epListRes = await fetch(proxyUrl(`${ONEMOVIES_BASE}/ajax/episodes/list?id=${movieIdMatch[1]}&_=ENCRYPT_ME`));
                        const epListData = await epListRes.json();
                        const cleanedHtml = cleanJsonHtml(epListData.result);
                        const episodeRegex = /<a[^>]+eid="([^"]+)"[^>]+num="([^"]+)"[^>]*>/g;
                        const matches = [...cleanedHtml.matchAll(episodeRegex)];
                        const targetEp = matches.find(([_, eid, num]) => parseInt(num) === parseInt(episode));
                        if (targetEp) {
                            const omStreams = await getOneMoviesStream(targetEp[1]);
                            streams = streams.concat(omStreams);
                        }
                    }
                }
            } catch (e) {
                console.error("1Movies TV stream error:", e.message);
            }
        }
        return { streams };
    } catch (error) {
        console.error("Stream handler error:", error.message);
        return { streams: [] };
    }
});
// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Ashi Stremio Addon running at http://localhost:${PORT}/manifest.json`)