# Apex HQ marketing showcase

This directory keeps the marketing-asset workflow in the repository instead
of an operating-system temp folder.

## Inputs

Place native browser screenshots in `captures/`:

- `desktop-command.png` — desktop `/marketing` viewport at 1440×900
- `mobile-command.png` — mobile `/marketing` viewport at 390×844

The screenshots must come from the real page. Do not substitute an
`html2canvas` render.

## Static Instagram asset

```bash
python3 tools/marketing-showcase/render_static.py
```

The script writes `public/apex-hq-showcase.png` at 1080×1350.

## Scrolling Instagram video

Capture actual browser-scroll frames into four folders, then run:

```bash
python3 tools/marketing-showcase/render_video.py \
  --frames /path/to/frame-folders
```

The frame-folder must contain `desktop/`, `mobile/`, `desktop-jobs/` and
`mobile-jobs/`, each containing equally numbered PNG frames. The renderer
composites the native frames into the same laptop/phone treatment and writes
`public/showcase-video.mp4`. It never synthesizes or pans a tall static page.
