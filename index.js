const { addonBuilder, serveHTTP } = require(“stremio-addon-sdk”);
const fetch = require(“node-fetch”);

const DENO_PROXY = “https://deno-proxies-sznvnpnxwhbv.deno.dev/?url=”;
const ANIMEKAI_BASE = “https://anikai.to”;
const ONEMOVIES_BASE = “https://1movies.bz”;
const ENC_API = “https://enc-dec.app/api”;
const TMDB_KEY = “9801b6b0548ad57581d111ea690c85c8”;
const TMDB_BASE = “https://api.themoviedb.org/3”;

function proxyUrl(url) {
return DENO_PROXY + encodeURIComponent(url);
}

const manifest = {
id: “org.ashi.stremio”,
version: “1.3.0”,
name: “Ashi - Literally Everything”,
description: “Anime, Movies & TV Shows from AnimeKai and 1Movies.”,
logo: “https://files.catbox.moe/ptq3a5.png”,
resources: [“catalog”, “meta”, “stream”],
types: [“movie”, “series”],
catalogs: [
{ type: “series”, id: “ashi-anime-popular”,  name: “Ashi - Popular Anime”,      extra: [{ name: “skip” }] },
{ type: “series”, id: “ashi-anime-top”,      name: “Ashi - Top Rated Anime”,    extra: [{ name: “skip” }] },
{ type: “movie”,  id: “ashi-movies-popular”, name: “Ashi - Popular Movies”,     extra: [{ name: “skip” }] },
{ type: “movie”,  id: “ashi-movies-top”,     name: “Ashi - Top Rated Movies”,   extra: [{ name: “skip” }] },
{ type: “series”, id: “ashi-tv-popular”,     name: “Ashi - Popular TV Shows”,   extra: [{ name: “skip” }] },
{ type: “series”, id: “ashi-tv-top”,         name: “Ashi - Top Rated TV Shows”, extra: [{ name: “skip” }] }
],
idPrefixes: [“tt”, “tmdb:”, “ashi:”]
};

const builder = new addonBuilder(manifest);

async function tmdbFetch(path) {
var sep = path.includes(”?”) ? “&” : “?”;
var res = await fetch(TMDB_BASE + path + sep + “api_key=” + TMDB_KEY + “&include_adult=false”);
return res.json();
}

async function tmdbIdFromImdb(imdbId) {
var data = await tmdbFetch(”/find/” + imdbId + “?external_source=imdb_id”);
return { movie: data.movie_results && data.movie_results[0], tv: data.tv_results && data.tv_results[0] };
}

function cleanJsonHtml(s) {
if (!s) return “”;
return s.replace(/\”/g, ‘”’).replace(/\’/g, “’”)
.replace(/\\/g, “\”).replace(/\n/g, “\n”)
.replace(/\t/g, “\t”).replace(/\r/g, “\r”);
}

function movieMeta(item) {
return {
id: “tmdb:movie:” + item.id,
type: “movie”,
name: item.title || item.original_title || “Untitled”,
poster: item.poster_path ? “https://image.tmdb.org/t/p/w500” + item.poster_path : undefined,
background: item.backdrop_path ? “https://image.tmdb.org/t/p/w1280” + item.backdrop_path : undefined,
description: item.overview || “”,
releaseInfo: item.release_date ? item.release_date.split(”-”)[0] : undefined,
imdbRating: item.vote_average ? String(item.vote_average.toFixed(1)) : undefined
};
}

function tvMeta(item) {
return {
id: “tmdb:tv:” + item.id,
type: “series”,
name: item.name || item.original_name || “Untitled”,
poster: item.poster_path ? “https://image.tmdb.org/t/p/w500” + item.poster_path : undefined,
background: item.backdrop_path ? “https://image.tmdb.org/t/p/w1280” + item.backdrop_path : undefined,
description: item.overview || “”,
releaseInfo: item.first_air_date ? item.first_air_date.split(”-”)[0] : undefined,
imdbRating: item.vote_average ? String(item.vote_average.toFixed(1)) : undefined
};
}

async function encKai(text) {
var res = await fetch(ENC_API + “/enc-kai?text=” + encodeURIComponent(text));
var json = await res.json();
return json.result;
}

async function decKai(text) {
var res = await fetch(ENC_API + “/dec-kai?text=” + encodeURIComponent(text));
var json = await res.json();
return json.result;
}

async function decMega(encResult, userAgent) {
var res = await fetch(ENC_API + “/dec-mega”, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({ text: encResult, agent: userAgent })
});
var json = await res.json();
return json && json.result && json.result.sources && json.result.sources[0] ? json.result.sources[0].file : null;
}

async function getAnimekaiEpisodeList(animePageUrl) {
var res = await fetch(proxyUrl(animePageUrl));
var html = await res.text();
var animeIdMatch = html.match(/<div class=“rate-box”[^>]*data-id=”([^”]+)”/);
if (!animeIdMatch) return [];
var animeId = animeIdMatch[1];
var token = await encKai(animeId);
var epListRes = await fetch(proxyUrl(ANIMEKAI_BASE + “/ajax/episodes/list?ani_id=” + animeId + “&_=” + token));
var epListData = await epListRes.json();
var cleanedHtml = cleanJsonHtml(epListData.result);
var episodeRegex = /<a[^>]+num=”([^”]+)”[^>]+token=”([^”]+)”[^>]*>/g;
var matches = [];
var m;
while ((m = episodeRegex.exec(cleanedHtml)) !== null) {
matches.push({ number: parseInt(m[1], 10), token: m[2] });
}
return matches;
}

async function getAnimekaiStream(episodeToken) {
var encryptedToken = await encKai(episodeToken);
var url = ANIMEKAI_BASE + “/ajax/links/list?token=” + episodeToken + “&_=” + encryptedToken;
var res = await fetch(proxyUrl(url));
var text = await res.text();
var ajaxHtml = “”;
try { ajaxHtml = cleanJsonHtml(JSON.parse(text).result || “”); } catch(e) {}
var serverHtml = ajaxHtml || cleanJsonHtml(text);

```
function extractServerId(section) {
    if (!section) return null;
    var preferred = /<span class="server"[^>]*data-lid="([^"]+)"[^>]*>\s*Server\s*1\s*<\/span>/i.exec(section);
    if (preferred && preferred[1]) return preferred[1];
    var fallback = /<span class="server"[^>]*data-lid="([^"]+)"/i.exec(section);
    return fallback ? fallback[1] : null;
}

var subMatch = /<div class="server-items lang-group" data-id="sub"[^>]*>([\s\S]*?)<\/div>/.exec(serverHtml);
var softsubMatch = /<div class="server-items lang-group" data-id="softsub"[^>]*>([\s\S]*?)<\/div>/.exec(serverHtml);
var dubMatch = /<div class="server-items lang-group" data-id="dub"[^>]*>([\s\S]*?)<\/div>/.exec(serverHtml);

var serverIds = {
    Sub:     extractServerId(subMatch ? subMatch[1] : ""),
    Softsub: extractServerId(softsubMatch ? softsubMatch[1] : ""),
    Dub:     extractServerId(dubMatch ? dubMatch[1] : "")
};

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
var entries = Object.keys(serverIds).filter(function(k) { return serverIds[k]; });

var streamResults = await Promise.all(entries.map(async function(type) {
    try {
        var serverId = serverIds[type];
        var encId = await encKai(serverId);
        var viewRes = await fetch(proxyUrl(ANIMEKAI_BASE + "/ajax/links/view?id=" + serverId + "&_=" + encId));
        var viewJson = await viewRes.json();
        var decrypted = await decKai(viewJson.result);
        var parsed = typeof decrypted === "string" ? JSON.parse(decrypted) : decrypted;
        var embedUrl = parsed && parsed.url;
        if (!embedUrl) return null;
        var mediaRes = await fetch(embedUrl.replace("/e/", "/media/"), {
            headers: { "Referer": ANIMEKAI_BASE + "/", "User-Agent": UA }
        });
        var mediaJson = await mediaRes.json();
        var streamUrl = await decMega(mediaJson && mediaJson.result, UA);
        if (!streamUrl) return null;
        return { type: type, streamUrl: streamUrl };
    } catch(e) { return null; }
}));

return streamResults.filter(Boolean).map(function(r) {
    var label = r.type === "Dub" ? "Dubbed EN" : r.type === "Softsub" ? "Original Audio" : "Hardsub EN";
    return { name: "AnimeKai", title: label, url: r.streamUrl, behaviorHints: { bingeGroup: "ashi-animekai" } };
});
```

}

async function getOneMoviesStream(episodeId) {
var encRes = await fetch(ENC_API + “/enc-movies-flix?text=” + encodeURIComponent(episodeId));
var encJson = await encRes.json();
var encToken = encJson.result;
var url = ONEMOVIES_BASE + “/ajax/links/list?eid=” + episodeId + “&*=” + encToken;
var res = await fetch(proxyUrl(url));
var data = await res.json();
var cleanedHtml = cleanJsonHtml(data.result);
var server1Match = /<div class=“server wnav-item”[^>]*data-lid=”([^”]+)”[^>]*>\s*<span>Server 1</span>/.exec(cleanedHtml);
if (!server1Match) return [];
var serverId = server1Match[1];
var serverTokenRes = await fetch(ENC_API + “/enc-movies-flix?text=” + encodeURIComponent(serverId));
var serverTokenJson = await serverTokenRes.json();
var serverToken = serverTokenJson.result;
var streamRes = await fetch(proxyUrl(ONEMOVIES_BASE + “/ajax/links/view?id=” + serverId + “&*=” + serverToken));
var streamData = await streamRes.json();
if (!streamData.result) return [];
var decryptRes = await fetch(ENC_API + “/dec-movies-flix”, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({ text: streamData.result })
});
var decryptData = await decryptRes.json();
var decryptedUrl = decryptData.result && decryptData.result.url;
if (!decryptedUrl) return [];

```
var englishSubUrl = "";
try {
    var subPart = decryptedUrl.split("sub.list=")[1];
    if (subPart) {
        var subListEncoded = subPart.split("&")[0];
        var subRes = await fetch(decodeURIComponent(subListEncoded));
        var subs = await subRes.json();
        var found = Array.isArray(subs) && subs.find(function(s) { return s.label === "English"; });
        englishSubUrl = found ? found.file.replace(/\\\//g, "/") : "";
    }
} catch(e) {}

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
var mediaRes = await fetch(decryptedUrl.replace("/e/", "/media/"), {
    headers: { "Referer": ONEMOVIES_BASE + "/", "User-Agent": UA }
});
var mediaJson = await mediaRes.json();
if (!mediaJson || !mediaJson.result) return [];
var finalRes = await fetch(ENC_API + "/dec-rapid?text=" + encodeURIComponent(mediaJson.result) + "&agent=" + encodeURIComponent(UA));
var finalJson = await finalRes.json();
var m3u8Link = finalJson && finalJson.result && finalJson.result.sources && finalJson.result.sources[0] && finalJson.result.sources[0].file;
if (!m3u8Link) return [];
var m3u8Res = await fetch(m3u8Link);
var m3u8Text = await m3u8Res.text();
var baseUrl = m3u8Link.substring(0, m3u8Link.lastIndexOf("/") + 1);
var streams = [];
var lines = m3u8Text.split("\n");
for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.indexOf("#EXT-X-STREAM-INF:") === 0) {
        var resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
        var quality = resMatch ? resMatch[1].split("x")[1] + "p" : "Auto";
        var streamPath = lines[i + 1] && lines[i + 1].trim();
        if (streamPath) {
            streams.push({
                name: "1Movies",
                title: quality,
                url: baseUrl + streamPath,
                subtitles: englishSubUrl ? [{ url: englishSubUrl, lang: "English" }] : [],
                behaviorHints: { bingeGroup: "ashi-1movies" }
            });
        }
    }
}
return streams;
```

}

builder.defineCatalogHandler(async function(args) {
var type = args.type, id = args.id, extra = args.extra;
var page = extra && extra.skip ? Math.floor(extra.skip / 20) + 1 : 1;
var endpoints = {
“ashi-anime-popular”:  “/tv/popular?page=” + page,
“ashi-anime-top”:      “/tv/top_rated?page=” + page,
“ashi-movies-popular”: “/movie/popular?page=” + page,
“ashi-movies-top”:     “/movie/top_rated?page=” + page,
“ashi-tv-popular”:     “/tv/popular?page=” + page,
“ashi-tv-top”:         “/tv/top_rated?page=” + page
};
var endpoint = endpoints[id];
if (!endpoint) return { metas: [] };
var data = await tmdbFetch(endpoint);
var results = data.results || [];
return { metas: results.map(function(item) { return type === “movie” ? movieMeta(item) : tvMeta(item); }) };
});

builder.defineMetaHandler(async function(args) {
var type = args.type, id = args.id;
var tmdbId = null;
if (id.indexOf(“tmdb:”) === 0) {
tmdbId = id.split(”:”)[2];
} else if (id.indexOf(“tt”) === 0) {
var found = await tmdbIdFromImdb(id);
tmdbId = type === “movie” ? (found.movie && found.movie.id) : (found.tv && found.tv.id);
}
if (!tmdbId) return { meta: null };
if (type === “movie”) {
var data = await tmdbFetch(”/movie/” + tmdbId);
return { meta: movieMeta(data) };
} else {
var data = await tmdbFetch(”/tv/” + tmdbId);
var meta = tvMeta(data);
var videos = [];
var seasons = data.seasons || [];
for (var s = 0; s < seasons.length; s++) {
if (seasons[s].season_number === 0) continue;
var seasonData = await tmdbFetch(”/tv/” + tmdbId + “/season/” + seasons[s].season_number);
var eps = seasonData.episodes || [];
for (var e = 0; e < eps.length; e++) {
videos.push({
id: “tmdb:tv:” + tmdbId + “:” + seasons[s].season_number + “:” + eps[e].episode_number,
title: eps[e].name || “Episode “ + eps[e].episode_number,
season: seasons[s].season_number,
episode: eps[e].episode_number,
released: eps[e].air_date ? new Date(eps[e].air_date) : undefined,
thumbnail: eps[e].still_path ? “https://image.tmdb.org/t/p/w300” + eps[e].still_path : undefined,
overview: eps[e].overview || “”
});
}
}
meta.videos = videos;
return { meta: meta };
}
});

builder.defineStreamHandler(async function(args) {
try {
var type = args.type, id = args.id;
var tmdbId, season, episode;
if (id.indexOf(“tmdb:”) === 0) {
var parts = id.split(”:”);
tmdbId = parts[2]; season = parts[3]; episode = parts[4];
} else if (id.indexOf(“tt”) === 0) {
var parts = id.split(”:”);
var found = await tmdbIdFromImdb(parts[0]);
tmdbId = type === “movie” ? (found.movie && found.movie.id) : (found.tv && found.tv.id);
season = parts[1]; episode = parts[2];
}
if (!tmdbId) return { streams: [] };
var streams = [];

```
    if (type === "movie") {
        var tmdbData = await tmdbFetch("/movie/" + tmdbId);
        var title = tmdbData.title || tmdbData.original_title;
        try {
            var sRes = await fetch(proxyUrl(ONEMOVIES_BASE + "/browser?keyword=" + encodeURIComponent(title)));
            var sHtml = await sRes.text();
            var hm = sHtml.match(/href="([^"]*)" class="poster"/);
            if (hm) {
                var mpUrl = hm[1].indexOf("http") === 0 ? hm[1] : ONEMOVIES_BASE + hm[1];
                var mpRes = await fetch(proxyUrl(mpUrl));
                var mpHtml = await mpRes.text();
                var mim = mpHtml.match(/<div class="detail-lower"[^>]*id="movie-rating"[^>]*data-id="([^"]+)"/);
                if (mim) { streams = streams.concat(await getOneMoviesStream(mim[1])); }
            }
        } catch(e) { console.error("1Movies movie error:", e.message); }
    } else {
        var tmdbData = await tmdbFetch("/tv/" + tmdbId);
        var title = tmdbData.name || tmdbData.original_name;
        try {
            var sRes = await fetch(proxyUrl(ANIMEKAI_BASE + "/browser?keyword=" + encodeURIComponent(title)));
            var sHtml = await sRes.text();
            var hm = sHtml.match(/href="([^"]*)" class="poster"/);
            if (hm) {
                var apUrl = hm[1].indexOf("http") === 0 ? hm[1] : ANIMEKAI_BASE + hm[1];
                var epList = await getAnimekaiEpisodeList(apUrl);
                var epNum = parseInt(episode);
                var tep = null;
                for (var i = 0; i < epList.length; i++) { if (epList[i].number === epNum) { tep = epList[i]; break; } }
                if (tep) { streams = streams.concat(await getAnimekaiStream(tep.token)); }
            }
        } catch(e) { console.error("AnimeKai error:", e.message); }
        try {
            var sRes2 = await fetch(proxyUrl(ONEMOVIES_BASE + "/browser?keyword=" + encodeURIComponent(title)));
            var sHtml2 = await sRes2.text();
            var hm2 = sHtml2.match(/href="([^"]*)" class="poster"/);
            if (hm2) {
                var spUrl = hm2[1].indexOf("http") === 0 ? hm2[1] : ONEMOVIES_BASE + hm2[1];
                var spRes = await fetch(proxyUrl(spUrl));
                var spHtml = await spRes.text();
                var sim = spHtml.match(/<div class="detail-lower"[^>]*id="movie-rating"[^>]*data-id="([^"]+)"/);
                if (sim) {
                    var encIdR = await fetch(ENC_API + "/enc-movies-flix?text=" + encodeURIComponent(sim[1]));
                    var encIdJ = await encIdR.json();
                    var elRes = await fetch(proxyUrl(ONEMOVIES_BASE + "/ajax/episodes/list?id=" + sim[1] + "&_=" + encIdJ.result));
                    var elData = await elRes.json();
                    var ch = cleanJsonHtml(elData.result);
                    var er = /<a[^>]+eid="([^"]+)"[^>]+num="([^"]+)"[^>]*>/g;
                    var em2, tep2 = null;
                    while ((em2 = er.exec(ch)) !== null) {
                        if (parseInt(em2[2]) === parseInt(episode)) { tep2 = em2[1]; break; }
                    }
                    if (tep2) { streams = streams.concat(await getOneMoviesStream(tep2)); }
                }
            }
        } catch(e) { console.error("1Movies TV error:", e.message); }
    }
    return { streams: streams };
} catch(error) {
    console.error("Stream handler error:", error.message);
    return { streams: [] };
}
```

});

var PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(“Ashi Stremio Addon running at http://localhost:” + PORT + “/manifest.json”);