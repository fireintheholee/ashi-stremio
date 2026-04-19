const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

// Map your fetchv2 to Node's native fetch
const fetchv2 = fetch; 

// ==========================================
// 1. STREMIO ID ENCODING HELPERS
// Stremio passes IDs via URL paths. Raw URLs will break routing.
// We encode your custom scraper URLs into Base64 format prefixed with "cstm:"
// ==========================================
const ID_PREFIX = "cstm:";
const encodeId = (url) => ID_PREFIX + Buffer.from(url).toString('base64url');
const decodeId = (id) => Buffer.from(id.replace(ID_PREFIX, ''), 'base64url').toString('utf8');

// ==========================================
// 2. STREMIO MANIFEST
// ==========================================
const manifest = {
    id: "org.custom.scraper",
    version: "1.0.0",
    name: "AnimeKai & 1Movies Scraper",
    description: "Custom streaming scraper for Anime and Movies",
    types: ["movie", "series", "anime"],
    catalogs: [
        {
            type: "other",
            id: "custom_search",
            name: "Scraper Search",
            extra: [{ name: "search", isRequired: true }]
        }
    ],
    resources: ["catalog", "meta", "stream"],
    idPrefixes: [ID_PREFIX]
};

const builder = new addonBuilder(manifest);

// ==========================================
// 3. STREMIO HANDLERS
// ==========================================

// Catalog: Fires when the user searches for something
builder.defineCatalogHandler(async (args) => {
    if (args.extra.search) {
        try {
            const resultsJson = await searchResults(args.extra.search);
            const results = JSON.parse(resultsJson);

            const metas = results
                .filter(r => r.href && r.title) // Filter out error objects
                .map(r => ({
                    id: encodeId(r.href), // Encode your custom href
                    type: r.href.includes("Animekai") ? "anime" : "movie",
                    name: r.title,
                    poster: r.image
                }));

            return { metas };
        } catch (err) {
            console.error("Catalog error:", err);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// Meta: Fires when the user clicks a poster to see details/episodes
builder.defineMetaHandler(async (args) => {
    try {
        const url = decodeId(args.id);
        const type = url.includes("Animekai") ? "anime" : "movie";
        
        // Fetch details and episodes in parallel
        const [detailsJson, episodesJson] = await Promise.all([
            extractDetails(url),
            extractEpisodes(url)
        ]);

        const details = JSON.parse(detailsJson)[0];
        const episodes = JSON.parse(episodesJson);

        const isSeries = episodes.length > 1;

        const meta = {
            id: args.id,
            type: isSeries ? "series" : type,
            name: details.aliases && details.aliases !== "Not available" ? details.aliases : "Unknown Title",
            description: details.description,
            released: details.airdate,
            videos: episodes[0]?.error ? [] : episodes.map(e => ({
                id: encodeId(e.href),
                title: `Episode ${e.number}`,
                episode: e.number,
                season: 1
            }))
        };

        return { meta };
    } catch (err) {
        console.error("Meta error:", err);
        return { meta: {} };
    }
});

// Stream: Fires when the user clicks an episode or the "Play" button
builder.defineStreamHandler(async (args) => {
    try {
        const url = decodeId(args.id);
        const streamDataJson = await extractStreamUrl(url);

        if (!streamDataJson || streamDataJson === "error" || streamDataJson.includes("error.org")) {
            return { streams: [] };
        }

        const streamData = JSON.parse(streamDataJson);
        const streams = streamData.streams.map(s => ({
            title: `${s.title}\n(Scraped)`, // Multi-line Stremio button title
            url: s.streamUrl,
            behaviorHints: {
                notWebReady: true // M3U8 usually needs a native player or external player
            }
        }));

        // Attach subtitles if available
        if (streamData.subtitles && streamData.subtitles !== "N/A") {
            streams.forEach(s => {
                s.subtitles = [{
                    url: streamData.subtitles,
                    lang: "eng"
                }];
            });
        }

        return { streams };
    } catch (err) {
        console.error("Stream error:", err);
        return { streams: [] };
    }
});


// ==========================================
// 4. YOUR SCRAPER LOGIC (PASTED BELOW)
// ==========================================

const DENO_PROXY_PREFIX = "https://deno-proxies-sznvnpnxwhbv.deno.dev/?url=";
const ANIKAI_HOME_TITLE_REGEX = /<title>Home - AnimeKai - Watch Free Anime Online, Stream Subbed &amp; Dubbed Anime in HD<\/title>/i;
const ANIKAI_CHECK_TIMEOUT_MS = 900;
let animekaiBlockCheckPromise = null;

function proxyUrl(url) {
  return DENO_PROXY_PREFIX + encodeURIComponent(url);
}

async function isAnimekaiBlockedForUser() { ... } // [Insert your original function here]
async function searchResults(query) { ... } // [Insert your original function here]
async function extractDetails(url) { ... } // [Insert your original function here]
async function extractEpisodes(url) { ... } // [Insert your original function here]
async function extractStreamUrl(url) { ... } // [Insert your original function here]
function cleanHtmlSymbols(string) { ... } // [Insert your original function here]
function cleanJsonHtml(jsonHtml) { ... } // [Insert your original function here]
function decodeHtmlEntities(text) { ... } // [Insert your original function here]

// ==========================================
// 5. START SERVER
// ==========================================
serveHTTP(builder.getInterface(), { port: 7000 });
