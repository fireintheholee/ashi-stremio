Ashi (あし) — Stremio Addon
Stremio addon wrapper for the Ashi source. Streams anime, movies, and TV shows from
AnimeKai and 1Movies.
Features
 Anime — Sub, Dub & Softsub from AnimeKai
 Movies — Multiple quality streams from 1Movies
 TV Shows — Episode streams from 1Movies
 English subtitles where available
 TMDB metadata (posters, descriptions, episode lists)
Setup
Requirements
Node.js 14+
npm
Install & Run
npm install
npm start
Addon available at:
http://localhost:7000/manifest.json
Add to Stremio
Local (same machine)
1. Open Stremio → Addons → search box
2. Paste: http://localhost:7000/manifest.json
3. Click Install
Deploy to Render (free, any device)
1. Push this folder to a GitHub repo
2. 
render.com → New Web Service → connect repo
3. Build: npm install | Start: npm start | Port: 7000
4. Install using: https://your-app.onrender.com/manifest.json
Deploy to Railway (free)
1. 
railway.app → New Project → GitHub repo
2. Set env var PORT=7000
3. Use the generated public URL
How it works
Content
Source
Stream Type
Anime
AnimeKai
HLS — Sub / Dub / Softsub
Movies
1Movies
HLS — 360p / 720p / 1080p
TV Shows
1Movies
HLS — 360p / 720p / 1080p
The addon:
1. Looks up TMDB metadata for catalogs and episode lists
2. Searches AnimeKai/1Movies for matching content by title
3. Runs the same encrypt/decrypt chain as the original ashi.js
4. Returns direct HLS stream URLs to Stremio
Catalogs
Name
Type
Popular Anime
series
Top Rated Anime
series
Popular Movies
movie
Top Rated Movies
movie
Popular TV Shows
series
Top Rated TV Shows
serie