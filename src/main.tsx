import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ReviewApp from './review/ReviewApp';

// Decide which mode to mount based on the embed data attribute (set when served
// from /edit on musicvideo.shakil.fun) or URL params.
function pickMode() {
  const root = document.getElementById('root')!;
  const embedSongId = root.dataset.songId;
  const embedToken  = root.dataset.token;
  const embedAudio  = root.dataset.audioUrl;
  if (embedSongId && embedToken && embedAudio) {
    return (
      <ReviewApp
        embedded={{
          songId: embedSongId,
          token: embedToken,
          audioUrl: embedAudio,
          backToWatch: root.dataset.backToWatch,
        }}
      />
    );
  }
  // Standalone mode: query param ?review opens review without embed data
  if (new URLSearchParams(location.search).get('review') !== null) {
    return <ReviewApp />;
  }
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{pickMode()}</StrictMode>
);
