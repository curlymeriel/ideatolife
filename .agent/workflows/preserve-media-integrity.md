---
description: How to preserve video/audio integrity when saving to IndexedDB
---

# 🔊 Media Data Integrity Workflow

To prevent the "No Audio" bug (where recorded/uploaded videos lose sound after saving), always follow these steps when working with the media storage layer.

## 1. Saving Media
- **NEVER** use `FileReader.readAsDataURL()` for video or audio files intended for persistence. Large files will be truncated.
- **ALWAYS** pass the raw `File` or `Blob` object directly to `saveToIdb`.
- **Immediate Save**: Call `useWorkflowStore.getState().saveProject()` immediately after a media reference is successfully stored in IDB to ensure the URL is persisted.

## 2. Retrieving Media
- When fetching a media URL from IndexedDB, always use the `{ asBlob: true }` option in `resolveUrl`.
- This ensures the browser generates a high-efficiency `blob:` URL which handles multi-track audio much better than `data:` URLs.

## 3. Verified Duplication (Project Cloning)
- **NEVER** use Base64 to transfer media between project IDs during duplication.
- **ALWAYS** fetch the source Blob and save it directly to the new ID's storage key.
- Whitelist all media metadata (`videoUrl`, `useVideoAudio`, `audioVolumes`) in the cloning loop inside `workflowStore.ts`.

## 4. UI Implementation (React & Store)
- **Store Whitelisting**: When implementing hydration or merge logic in `workflowStore.ts`, explicitly preserve media-related fields to prevent silent resets during project switches.
- **Forced Healing**: React `video` elements often miss initial volume settings. Re-sync `muted/volume` imperativeley on `play` and `loadedmetadata` events.

## 5. Verification Checklist
If a video element has no sound:
1. Open DevTools console: `$0.webkitAudioDecodedByteCount`.
2. If value < 10,000 bytes: Data is **truncated at source**. (Check Base64 usage in saving/cloning).
3. If value is large but no sound: Source is likely fine, but `muted` or `volume` state is out of sync.
4. Check if `useVideoAudio` flag is `true` in the store for that cut.
